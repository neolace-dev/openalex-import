#!/usr/bin/env deno run --allow-net --allow-read --allow-write --allow-env
// deno-lint-ignore-file no-unused-vars
import { S3Client } from "https://deno.land/x/s3_lite_client@0.2.0/mod.ts";
import { dirname } from "std/path/mod.ts";
import { importConcept } from "./concept-import.ts";
import { importInstitution } from "./institutions-import.ts";
import { importAuthor } from "./authors-import.ts";
import { importVenue } from "./venue-import.ts";
import { importWork } from "./works-import.ts";

import { api, getApiClient } from "./neolace-api-client.ts";
import { exists, getIdFromUrlIfSet, promiseState } from "./utils.ts";

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
    condition?: (data: EntityData) => boolean,
) {
    // TODO: this should use the manifest files so that older files which have been deleted on the server can be ignored.
    // See https://docs.openalex.org/download-snapshot/snapshot-data-format#the-manifest-file
    // TODO: this should use the merged_ids to delete merged entries
    // See https://docs.openalex.org/download-snapshot/snapshot-data-format#merged-entities
    console.log("Scanning files...");
    const all_dates = Array.from(
        Deno.readDirSync(`data/${entity_string}`),
    ).filter(
        (e) => e.name.startsWith("updated_date"),
    ).map((e) => e.name).toSorted();

    const all_files: string[] = [];
    all_dates.forEach((date) => {
        all_files.push(
            ...Array.from(Deno.readDirSync(`data/${entity_string}/${date}`)).filter(
                (e) => e.name.endsWith(".gz"),
            ).map((e) => `data/${entity_string}/${date}/${e.name}`),
        );
    });

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
            lastPromise = client.pushBulkEdits(newEditsToPush, { connectionId: "openalex", createConnection: true });
        }
    };

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
    }

    console.log(`There are a total of ${all_files.length} files to process.`);
    const startTime = performance.now();
    console.time("overall");
    for (const path of all_files) {
        console.log(`Processing entries in file at path ${path}`);
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
            const {done, value} = await reader.read();
            if (done) break;
            const toProcess = unprocessed + value;
            const lines = toProcess.split("\n");
            unprocessed = lines.pop() ?? ""; // The last line may be incomplete because the stream splits the file into random chunks.
            for (const line of lines) {
                await importLine(line);
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

// await download_things('concepts');
// await download_things('institutions');
// await download_things('venues');
// await download_things("authors");

// await import_entities("concepts", importConcept);
// await import_entities("institutions", importInstitution);
// await import_entities("venues", importVenue);

// Import authors associated to UBC
const ubcInstitiutionId = "I141945490";
await import_entities(
    "authors",
    importAuthor,
    (author) => getIdFromUrlIfSet(author.last_known_institution?.id) === ubcInstitiutionId,
);
