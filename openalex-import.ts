#!/usr/bin/env deno run --allow-net --allow-read --allow-write --allow-env
// deno-lint-ignore-file no-unused-vars
import { S3Client } from "https://deno.land/x/s3_lite_client@0.2.0/mod.ts";
import { dirname } from "std/path/mod.ts";
import { gunzip } from "https://deno.land/x/compress@v0.4.1/mod.ts";
import { importConcept } from "./concept-import.ts"
import { importInstitution } from "./institutions-import.ts"
import { importAuthor } from "./authors-import.ts"
import { importVenue } from "./venue-import.ts"
import { importWork } from "./works-import.ts"

import { api, getApiClient } from "./neolace-api-client.ts";
import { exists, promiseState } from "./utils.ts";

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
    Deno.mkdirSync(dirname(local_path), {recursive: true});
    if (exists(local_path)) {
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
    Deno.readDirSync(`data/${entity_string}`)).filter(
      (e) => e.name.startsWith('updated_date')
    ).map((e) => e.name).toSorted();

  const all_files: string[] = [];
  all_dates.forEach((date) => {
    all_files.push(
      ...Array.from(Deno.readDirSync(`data/${entity_string}/${date}`)).filter(
        (e) => e.name.endsWith('.gz')).map((e) => `data/${entity_string}/${date}/${e.name}`
      ));
  });

  const client = await getApiClient();
  let pendingEdits: api.AnyBulkEdit[] = [];
  let lastPromise: Promise<unknown>|undefined = undefined;
  const pushEdits = async () => {
    if (lastPromise && (await promiseState(lastPromise)).status === "pending") {
      console.log("Waiting for last bulk edit to complete...");
      await lastPromise;
    }
    if (pendingEdits.length > 0) {
      const newEditsToPush = [...pendingEdits];
      console.log("Submitting", newEditsToPush.length, "edits...");
      pendingEdits = [];
      lastPromise = client.pushBulkEdits(newEditsToPush, {connectionId: "openalex", createConnection: true});
    }
  }


  console.log(`There are a total of ${all_files.length} files to process.`);
  const startTime = performance.now();
  console.time("overall");
  for (const path of all_files) {
    console.log(`Processing entries in file at path ${path}`);
    const curr_obj = await Deno.readFile(path);
    const curr_file = gunzip(curr_obj);
    const curr_string = new TextDecoder().decode(curr_file);
    const lines = curr_string.split('\n');

    for (const line of lines) {
      if (line.trim() == '') {
        continue;
      }
      let json_entity;
      try {
        json_entity = JSON.parse(line);
      } catch {
        try {
          // Work around a known escaping issue: https://groups.google.com/g/openalex-users/c/JuC50PvvpGY
          json_entity = JSON.parse(line.replaceAll(`\\\\`, `\\`));
        } catch (err) {
          console.error(`JSON entity could not be parsed:\n`, line);
          throw err;
        }
      }
      // console.log(json_entity);
      const doImport = condition === undefined || condition(json_entity);
      if (doImport) {
        pendingEdits.push(...entity_import(json_entity));
      }
      if (pendingEdits.length > 500) {
        await pushEdits();
      }
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
// await download_things('authors');

// const country = "CA";
// await import_entities(
//   "institutions",
//   importInstitutionToTheDatabase,
//   (institution) => {
//     return institution.country_code == country;
//   }
// )

//  import authors associated to Canadian Institutions
// await import_entities(
//   "authors",
//   importAuthorToTheDatabase,
//   (author) => {
//     if (author.last_known_institution) {
//       if (author.last_known_institution.country_code == "CA") {
//         return true;
//       }
//     }
//     return false;
//   }
// )

await import_entities("concepts", importConcept);
await import_entities("institutions", importInstitution);



//  import authors associated to Canadian Institutions
// await import_entities(
//   "authors",
//   importAuthorToTheDatabase,
//   (_author) => {
//     const author = _author as any as Author;
//     if (author.last_known_institution) {
//       if (author.last_known_institution.country_code == "CA") {
//         return true;
//       }
//     }
//     return false;
//   }
// )
// There are a total of 29.

