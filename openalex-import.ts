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

async function import_concepts(max_level: number) {
  const all_dates = Array.from(Deno.readDirSync('data/concepts')).filter((e) => e.name.startsWith('updated_date')).map((e) => e.name);
  const all_files: string[] = [];
  all_dates.forEach((date) => {
    all_files.push(...Array.from(Deno.readDirSync(`data/concepts/${date}`)).filter((e) => e.name.endsWith('.gz')).map((e) => `data/concepts/${date}/${e.name}`));
  });

  console.log(`There are a total of ${all_files.length}.`);
  console.time("overall");
  for (let curr_level = 0 ; curr_level <= max_level; curr_level++) {
    console.time(`level ${curr_level}`);
    for (const path of all_files) {
      console.log(`Processing level ${curr_level} entries in file at path ${path}`);
      const curr_obj = await Deno.readFile(path);
      const curr_file = gunzip(curr_obj);
      const curr_string = new TextDecoder().decode(curr_file);
      const lines = curr_string.split('\n');
  
      let pendingPromises: Promise<void>[] = [];
  
      for (const concept of lines) {
        if (concept.trim() == '') {
          continue;
        }
        const json_concept = JSON.parse(concept);
        // console.log(json_concept);
        if (json_concept.level == curr_level) {
          pendingPromises.push(importConceptToTheDatabase(json_concept));
        }
        if (pendingPromises.length > 5) {
          await Promise.all(pendingPromises);
          pendingPromises = [];
        }
      }
      await Promise.all(pendingPromises);
    }
    console.timeEnd(`level ${curr_level}`);
  }
  console.timeEnd("overall");
}

async function import_insitutions_by_country(country_code: string) {
  const all_dates = Array.from(
    Deno.readDirSync('data/institutions')).filter(
      (e) => e.name.startsWith('updated_date')
    ).map((e) => e.name);

  const all_files: string[] = [];
  all_dates.forEach((date) => {
    all_files.push(
      ...Array.from(Deno.readDirSync(`data/institutions/${date}`)).filter(
        (e) => e.name.endsWith('.gz')).map((e) => `data/institutions/${date}/${e.name}`
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

    for (const institutions of lines) {
      if (institutions.trim() == '') {
        continue;
      }
      const json_concept = JSON.parse(institutions);
      // console.log(json_concept);
      if (json_concept.country_code == country_code) {
        pendingPromises.push(importInstitutionToTheDatabase(json_concept));
      }
      if (pendingPromises.length > 5) {
        await Promise.all(pendingPromises);
        pendingPromises = [];
      }
      await Promise.all(pendingPromises);
    }
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

// await import_concepts(1);
import_insitutions_by_country("CA")
