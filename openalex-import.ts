#!/usr/bin/env deno run --allow-net --allow-read --allow-write --allow-env
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

async function download_things(entityType: string) {
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

async function import_entities<EntityData>(
    entity_string: string,
    entity_import: (json_object: EntityData) => api.AnyBulkEdit[],
    /** The last date that was already imported; only process files after this date. */
    lastDate: string,
    condition?: (data: EntityData) => boolean,
) {
    // TODO: this should use the merged_ids to delete merged entries
    // See https://docs.openalex.org/download-snapshot/snapshot-data-format#merged-entities
    console.log(`Reading ${entity_string} manifest...`);

    const manifest = JSON.parse(await Deno.readTextFile(`data/${entity_string}/manifest`));

    const filesToProcess: { date: string; fileName: string; numEntities: number }[] = [];

    for (const entry of manifest.entries) {
        const prefix = `s3://openalex/data/${entity_string}/updated_date=`;
        if (!entry.url.startsWith(prefix)) throw new Error(`Unexpected URL: ${entry.url}`);
        const [date, fileName] = entry.url.slice(prefix.length).split("/");
        const numEntities = entry.meta.record_count;
        if (date <= lastDate) {
            // console.log(`Skipping ${numEntities} entities from already processed file ${date}/${fileName}`);
            continue;
        }
        filesToProcess.push({ date, fileName, numEntities });
    }
    /** The total number of entities we haven't yet imported. */
    const totalEntitiesToImport = filesToProcess.reduce((n, e) => n + e.numEntities, 0);

    const client = await getApiClient();
    let pendingEdits: api.AnyBulkEdit[] = [];
    let lastPromise: Promise<unknown> | undefined = undefined;
    const pushEdits = async () => {
        if (lastPromise && (await promiseState(lastPromise)).status === "pending") {
            console.log("Waiting for last bulk edit to complete...");
            await lastPromise;
        }
        if (pendingEdits.length > 0) {
            const newEditsToPush = [...pendingEdits];
            console.log("Submitting", newEditsToPush.length, "edits...");
            pendingEdits = [];
            lastPromise = client.pushBulkEdits(newEditsToPush, { connectionId: "openalex", createConnection: true })
                .catch((err) => {
                    Deno.writeTextFileSync(
                        "failed-edits.json",
                        newEditsToPush.map((e) => JSON.stringify(e, undefined, 2)).join("\n\n"),
                    );
                    console.log("Failed edits were written to failed-edits.json");
                    throw err;
                });
        }
    };

    /** This function will parse and queue the import of a single line from one of the files */
    const importLine = async (line: string) => {
        if (line.trim() === "") {
            return;
        }
        let json_entity;
        try {
            json_entity = JSON.parse(line);
        } catch {
            try {
                // Work around a known escaping issue: https://groups.google.com/g/openalex-users/c/JuC50PvvpGY
                json_entity = JSON.parse(line.replaceAll(`\\\\`, `\\`));
            } catch (err) {
                console.error(`JSON line could not be parsed:\n`, line);
                throw err;
            }
        }
        // console.log(json_entity);
        const doImport = condition === undefined || condition(json_entity);
        if (doImport) {
            try {
                pendingEdits.push(...entity_import(json_entity));
            } catch (err) {
                console.error(`A ${entity_string} entity could not be parsed:\n`, line);
                throw err;
            }
        }
        // Note: depending on the entity type, you can adjust this limit between 100 and 500
        // to balance import speed vs. the risk of getting an error for the transaction needing
        // too much memory.
        if (pendingEdits.length > 100) {
            // console.log(JSON.stringify(pendingEdits[0], undefined, 2));
            await pushEdits();
        }
    };

    console.log(
        `There are a total of ${filesToProcess.length} files to process containing ${totalEntitiesToImport} entities.`,
    );
    const startTime = performance.now();
    let entitiesImported = 0;
    for (const file of filesToProcess) {
        const path = `data/${entity_string}/updated_date=${file.date}/${file.fileName}`;
        console.log(
            `Processing ${entity_string} in ${path} (${(entitiesImported / totalEntitiesToImport * 100).toFixed(2)}%)`,
        );
        const fileHandle = await Deno.open(path);

        const stream = (
            fileHandle.readable
                .pipeThrough(new DecompressionStream("gzip"))
                .pipeThrough(new TextDecoderStream())
        );
        const reader = stream.getReader();

        let unprocessed = "";
        while (true) {
            // Read a chunk of the file:
            const { done, value } = await reader.read();
            if (done) break;
            const toProcess = unprocessed + value;
            const lines = toProcess.split("\n");
            unprocessed = lines.pop() ?? ""; // The last line may be incomplete because the stream splits the file into random chunks.
            for (const line of lines) {
                await importLine(line);
                entitiesImported++;
            }
        }
        if (unprocessed) {
            const line = unprocessed;
            await importLine(line);
        }
    }
    await pushEdits();
    await lastPromise;
    const totalTimeMs = performance.now() - startTime;
    console.log("Took: ", Math.round(totalTimeMs / 1_000), "s");
}

// Note: see the release notes at https://github.com/ourresearch/openalex-guts/blob/main/files-for-datadumps/standard-format/RELEASE_NOTES.txt

const flags = parse(Deno.args, {
    boolean: ["download"],
    string: ["last-date"],
    default: { download: true, "last-date": "2022-01-01" },
});

const entities = flags._;
const validEntities = ["all", "concepts", "institutions", "venues", "authors", "works"];
if (!entities.every((e) => validEntities.includes(e as string))) throw new Error("Invalid Entity");
const doAllEntities = entities.includes("all");
const ubcInstitiutionId = "I141945490";

if (flags.download) {
    for (const entityType of validEntities.slice(1)) {
        if (entities.includes(entityType) || doAllEntities) {
            await download_things(entityType);
        }
    }
}

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
