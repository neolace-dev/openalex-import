#!/usr/bin/env deno run --import-map=import_map.json --allow-net --allow-read --allow-write --allow-env --unstable --no-check
import { S3Client } from "https://deno.land/x/s3_lite_client@0.2.0/mod.ts";
import { dirname } from "https://deno.land/std@0.125.0/path/mod.ts";
import { gunzip } from "https://deno.land/x/compress@v0.4.1/mod.ts";
import { importConceptToTheDatabase } from "./concept-import-improved.ts"

const s3client = new S3Client({
  endPoint: "s3.amazonaws.com",
  port: 443,
  useSSL: true,
  region: "us-east-1",
  bucket: "openalex",
  pathStyle: false,
});


const all_files: string[] = [];

for await (const obj of s3client.listObjects({ prefix: "data/concepts/" })) {
  if (obj.key.endsWith('manifest')) {
    continue;
  }
  const local_path = obj.key;
  all_files.push(local_path);
  Deno.mkdirSync(dirname(local_path), {recursive: true});
  if (exist(local_path)) {
    continue;
  }
  console.log(`Downloading ${local_path}`);
  const curr_obj = await s3client.getObject(obj.key);
  await Deno.writeFile(local_path, new Uint8Array(await curr_obj.arrayBuffer()));
}

console.log(`There are a total of ${all_files.length}.`)
for (let level = 0 ; level <= 5; level++) {
  for (const path of all_files) {
    console.log(`Processing level ${level} entries in file at path ${path}`);
    const curr_obj = Deno.readFileSync(path);
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
      if (json_concept.level == level) {
        pendingPromises.push(importConceptToTheDatabase(json_concept));
      }
      if (pendingPromises.length > 5) {
        await Promise.all(pendingPromises);
        pendingPromises = [];
      }
    }
    await Promise.all(pendingPromises);
  }
}

function exist(path: string) {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}
