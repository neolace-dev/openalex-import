#!/usr/bin/env deno run --allow-net --allow-read --allow-write --allow-env
import { TextLineStream } from "https://deno.land/std@0.167.0/streams/text_line_stream.ts";
import { S3Client } from "https://deno.land/x/s3_lite_client@0.2.0/mod.ts";
import { parse } from "std/flags/mod.ts";
import { dirname } from "std/path/mod.ts";
import { importConcept } from "./concept-import.ts";
import { importInstitution } from "./institutions-import.ts";
import { importAuthor } from "./authors-import.ts";
import { importVenue } from "./venue-import.ts";
import { importWork } from "./works-import.ts";

import { api, getApiClient } from "./neolace-api-client.ts";
import { exists, getIdFromUrl, getIdFromUrlIfSet, promiseState } from "./utils.ts";

const s3client = new S3Client({
    endPoint: "s3.amazonaws.com",
    port: 443,
    useSSL: true,
    region: "us-east-1",
    bucket: "openalex",
    pathStyle: false,
});

/**
 * Download the latest manifest and data files for the specified entitiy, e.g. "concepts"
 *
 * If the data files already exist locally, no new data files will be downloaded.
 * The manifest is always updated to the latest version in any case.
 */
async function downloadEntityDataFiles(entityType: string) {
    for await (const obj of s3client.listObjects({ prefix: `data/${entityType}/` })) {
        const local_path = obj.key;
        Deno.mkdirSync(dirname(local_path), { recursive: true });
        // We always need the latest manifest file:
        const forceOverwrite: boolean = obj.key.endsWith("manifest");
        if (exists(local_path) && !forceOverwrite) {
            continue;
        }
        console.log(`Downloading ${local_path}`);
        const curr_obj = await s3client.getObject(obj.key);
        await Deno.writeFile(local_path, new Uint8Array(await curr_obj.arrayBuffer()));
    }
}

/**
 * Read the downloaded manifest file for the given entityType (e.g. "concepts")
 * and return the list of all the data files that we need to process.
 *
 * If lastDate is specified, only data files *newer* than 'lastDate' are
 * returned. So if 'lastDate' is the last time this import process ran
 * successfully, this will only return new data files, if there are any.
 * You can use that to only apply new changes as they are published,
 * rather than going over the whole data set again.
 */
async function getFilesFromManifest(
    entityType: string,
    lastDate: string,
): Promise<{ date: string; fileName: string; numEntities: number }[]> {
    console.log(`Reading ${entityType} manifest...`);

    const manifest = JSON.parse(await Deno.readTextFile(`data/${entityType}/manifest`));

    const filesToProcess: { date: string; fileName: string; numEntities: number }[] = [];

    for (const entry of manifest.entries) {
        const prefix = `s3://openalex/data/${entityType}/updated_date=`;
        if (!entry.url.startsWith(prefix)) throw new Error(`Unexpected URL: ${entry.url}`);
        const [date, fileName] = entry.url.slice(prefix.length).split("/");
        const numEntities = entry.meta.record_count;
        if (date <= lastDate) {
            // console.log(`Skipping ${numEntities} entities from already processed file ${date}/${fileName}`);
            continue;
        }
        filesToProcess.push({ date, fileName, numEntities });
    }
    return filesToProcess;
}

/**
 * A class that can be used to push a bunch of "bulk edits" to a Neolace server.
 * However, it first checks if the last batch of edits completed yet or not.
 * If they haven't yet completed, it waits for them first before submitting the
 * next edits.
 */
class EditPusher {
    lastPromise: Promise<unknown> | undefined = undefined;

    constructor(private readonly client: api.NeolaceApiClient) {}

    /**
     * Push some edits. This function will block until the *previous* set of edits is done,
     * but it otherwise fullfills immediately and doesn't wait for this new batch of edits
     * to complete, so that we can continue reading and processing data while that happens.
     */
    async submitEdits(edits: api.AnyBulkEdit[]) {
        if (this.lastPromise && (await promiseState(this.lastPromise)).status === "pending") {
            console.log("Waiting for last bulk edit to complete...");
            await this.lastPromise;
        }
        if (edits.length > 0) {
            console.log("Submitting", edits.length, "edits...");
            this.lastPromise = this.client.pushBulkEdits(edits, { connectionId: "openalex", createConnection: true })
                .catch((err) => {
                    Deno.writeTextFileSync(
                        "failed-edits.json",
                        edits.map((e) => JSON.stringify(e, undefined, 2)).join("\n\n"),
                    );
                    console.log("Failed edits were written to failed-edits.json");
                    throw err;
                });
        }
    }
}

/**
 * Parse a single line (representing an OpenAlex entity) as JSON,
 * dealing with some known encoding quirks.
 */
function parseLine(line: string) {
    try {
        return JSON.parse(line);
    } catch {
        try {
            // Work around a known escaping issue: https://groups.google.com/g/openalex-users/c/JuC50PvvpGY
            return JSON.parse(line.replaceAll(`\\\\`, `\\`));
        } catch (err) {
            console.error(`JSON line could not be parsed:\n`, line);
            throw err;
        }
    }
}

async function import_entities<EntityData>(
    entityType: string,
    entity_import: (json_object: EntityData) => api.AnyBulkEdit[],
    /** The last date that was already imported; only process files after this date. */
    lastDate: string,
    condition?: (data: EntityData) => boolean,
) {
    // TODO: this should use the merged_ids to delete merged entries
    // See https://docs.openalex.org/download-snapshot/snapshot-data-format#merged-entities

    /** Read the manifest file to get the list of data files we need to process */
    const filesToProcess = await getFilesFromManifest(entityType, lastDate);

    /** The total number of entities we haven't yet imported. */
    const totalEntitiesToImport = filesToProcess.reduce((n, e) => n + e.numEntities, 0);

    let pendingEdits: api.AnyBulkEdit[] = [];
    const editPusher = new EditPusher(await getApiClient())

    console.log(
        `There are a total of ${filesToProcess.length} files to process containing ${totalEntitiesToImport} entities.`,
    );
    const startTime = performance.now();
    let entitiesImported = 0;
    for (const file of filesToProcess) {
        const path = `data/${entityType}/updated_date=${file.date}/${file.fileName}`;
        console.log(
            `Processing ${entityType} in ${path} (${(entitiesImported / totalEntitiesToImport * 100).toFixed(2)}%)`,
        );
        const fileHandle = await Deno.open(path);

        const stream = (
            fileHandle.readable
                .pipeThrough(new DecompressionStream("gzip"))
                .pipeThrough(new TextDecoderStream())
                .pipeThrough(new TextLineStream())
        );
        const reader = stream.getReader();

        while (true) {
            // Read a chunk of the file:
            const { done, value: line } = await reader.read();
            if (done) break;
            if (line.trim() === "") continue;

            // Parse and import it:
            const jsonEntity = parseLine(line);
            try {
                const shouldImport = condition === undefined || condition(jsonEntity);
                if (shouldImport) {
                    pendingEdits.push(...entity_import(jsonEntity));
                }
            } catch (err) {
                console.error(`A ${entityType} entity could not be parsed:\n`, line);
                throw err;
            }
            // Note: depending on the entity type, you can adjust this limit between 100 and 500
            // to balance import speed vs. the risk of getting an error for the transaction needing
            // too much memory.
            if (pendingEdits.length > 100) {
                // console.log(JSON.stringify(pendingEdits[0], undefined, 2));
                await editPusher.submitEdits(pendingEdits);
                pendingEdits = [];
            }
            entitiesImported++;
        }
    }
    if (pendingEdits.length > 0) {
        await editPusher.submitEdits(pendingEdits);
        pendingEdits = [];
    }
    const totalTimeMs = performance.now() - startTime;
    console.log("Took: ", Math.round(totalTimeMs / 1_000), "s");
}

// Note: see the release notes at https://github.com/ourresearch/openalex-guts/blob/main/files-for-datadumps/standard-format/RELEASE_NOTES.txt

const flags = parse(Deno.args, {
    boolean: ["download", "import"],
    negatable: ["download", "import"],
    string: ["last-date"],
    default: { download: true, import: true, "last-date": "2022-01-01" },
});

const entities = flags._;
const validEntities = ["all", "concepts", "institutions", "venues", "authors", "works"];
if (!entities.every((e) => validEntities.includes(e as string))) throw new Error("Invalid Entity");
const doAllEntities = entities.includes("all");
const ubcInstitiutionId = "I141945490";

if (flags.download) {
    for (const entityType of validEntities.slice(1)) {
        if (entities.includes(entityType) || doAllEntities) {
            await downloadEntityDataFiles(entityType);
        }
    }
    await downloadEntityDataFiles("merged_ids");
}

if (flags.import) {
    if (entities.includes("concepts") || doAllEntities) {
        await import_entities("concepts", importConcept, flags["last-date"]);
    }
    if (entities.includes("institutions") || doAllEntities) {
        await import_entities("institutions", importInstitution, flags["last-date"]);
    }
    if (entities.includes("venues") || doAllEntities) {
        await import_entities("venues", importVenue, flags["last-date"]);
    }
    if (entities.includes("authors") || doAllEntities) {
        await import_entities(
            "authors",
            importAuthor,
            flags["last-date"],
            // Import authors associated with UBC:
            (author) => getIdFromUrlIfSet(author.last_known_institution?.id) === ubcInstitiutionId,
        );
    }
    if (entities.includes("works") || doAllEntities) {
        await import_entities(
            "works",
            importWork,
            flags["last-date"],
            // Import works from authors associated with UBC:
            (work) =>
                work.authorships.find((a) => a.institutions.find((i) => getIdFromUrl(i.id) === ubcInstitiutionId)) !==
                    undefined,
        );
    }
}

// TODO: Merge entities
