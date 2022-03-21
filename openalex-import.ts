#!/usr/bin/env deno run --import-map=import_map.json --allow-net --allow-read --allow-write --allow-env --unstable --no-check
import { S3Client } from "https://deno.land/x/s3_lite_client@0.2.0/mod.ts";
import { dirname } from "https://deno.land/std@0.125.0/path/mod.ts";
import { gunzip } from "https://deno.land/x/compress@v0.4.1/mod.ts";
import { importConceptToTheDatabase } from "./concept-import.ts"
import { importInstitutionToTheDatabase } from "./institutions-import.ts"

const s3client = new S3Client({
  endPoint: "s3.amazonaws.com",
  port: 443,
  useSSL: true,
  region: "us-east-1",
  bucket: "openalex",
  pathStyle: false,
});


async function download_things(thing_type: string) {
  for await (const obj of s3client.listObjects({ prefix: `data/${thing_type}/` })) {
    if (obj.key.endsWith('manifest')) {
      continue;
    }
    const local_path = obj.key;
    Deno.mkdirSync(dirname(local_path), {recursive: true});
    if (exist(local_path)) {
      continue;
    }
    console.log(`Downloading ${local_path}`);
    const curr_obj = await s3client.getObject(obj.key);
    await Deno.writeFile(local_path, new Uint8Array(await curr_obj.arrayBuffer()));
  }
}

async function import_entities(
  entity_string: string, 
  entity_import: (json_object: any) => Promise<void>, 
  checkCriterion: (json_object: Record<string, unknown>) => boolean
) {
  const all_dates = Array.from(
    Deno.readDirSync(`data/${entity_string}`)).filter(
      (e) => e.name.startsWith('updated_date')
    ).map((e) => e.name);

  const all_files: string[] = [];
  all_dates.forEach((date) => {
    all_files.push(
      ...Array.from(Deno.readDirSync(`data/${entity_string}/${date}`)).filter(
        (e) => e.name.endsWith('.gz')).map((e) => `data/${entity_string}/${date}/${e.name}`
      ));
  });

  console.log(`There are a total of ${all_files.length}.`);
  console.time("overall");

  for (const path of all_files) {
    const curr_obj = await Deno.readFile(path);
    const curr_file = gunzip(curr_obj);
    const curr_string = new TextDecoder().decode(curr_file);
    const lines = curr_string.split('\n');

    let pendingPromises: Promise<void>[] = [];

    for (const entity of lines) {
      if (entity.trim() == '') {
        continue;
      }
      const json_entity = JSON.parse(entity);
      // console.log(json_concept);
      if (checkCriterion(json_entity)) {
        pendingPromises.push(entity_import(json_entity));
      }
      if (pendingPromises.length > 5) {
        await Promise.all(pendingPromises);
        pendingPromises = [];
      }
    }
    await Promise.all(pendingPromises);
  }
  console.timeEnd("overall");
}

function exist(path: string) {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

// await download_things('concepts')
// await download_things('institutions')
// const maxLevel = 2;

// for (let level = 0; level < maxLevel; level++) {
//   await import_entities(
//     "concepts",
//     importConceptToTheDatabase,
//     (concept) => {
//       return concept.level == level;
//     }
//   );
// }

const country = "CA";
await import_entities(
  "institutions",
  importInstitutionToTheDatabase,
  (institution) => {
    return institution.country_code == country;
  }
)

// TODO authors by last known institution by country
// await import_authors(
//   "authors",

// )




