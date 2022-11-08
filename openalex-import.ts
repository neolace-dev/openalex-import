#!/usr/bin/env deno run --allow-net --allow-read --allow-write --allow-env --no-check
import { S3Client } from "https://deno.land/x/s3_lite_client@0.2.0/mod.ts";
import { dirname } from "std/path/mod.ts";
import { gunzip } from "https://deno.land/x/compress@v0.4.1/mod.ts";
import { importConceptToTheDatabase } from "./concept-import.ts"
import { api, getApiClient } from "./neolace-api-client.ts";

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
    const local_path = obj.key;
    Deno.mkdirSync(dirname(local_path), {recursive: true});
    const forceOverwrite: boolean = obj.key.endsWith('manifest');
    if (exist(local_path) &&!forceOverwrite) {
      continue;
    }
    console.log(`Downloading ${local_path}`);
    const curr_obj = await s3client.getObject(obj.key);
    await Deno.writeFile(local_path, new Uint8Array(await curr_obj.arrayBuffer()));
  }
}

async function import_concepts() {
  const all_dates = Array.from(Deno.readDirSync('data/concepts')).filter((e) => e.name.startsWith('updated_date')).map((e) => e.name).sort((a, b) => a.localeCompare(b));
  const all_files: string[] = [];
  all_dates.forEach((date) => {
    all_files.push(...Array.from(Deno.readDirSync(`data/concepts/${date}`)).filter((e) => e.name.endsWith('.gz')).map((e) => `data/concepts/${date}/${e.name}`).sort((a, b) => a.localeCompare(b)));
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
  console.time("overall");
  const maxLevel = 1;
  for (const path of all_files) {
    console.log(`Processing entries in file at path ${path}`);
    const curr_obj = await Deno.readFile(path);
    const curr_file = gunzip(curr_obj);
    const curr_string = new TextDecoder().decode(curr_file);
    const lines = curr_string.split('\n');

    for (const concept of lines) {
      if (concept.trim() == '') {
        continue;
      }
      let json_concept;
      try {
        json_concept = JSON.parse(concept);
      } catch {
        try {
          // Work around a known escaping issue: https://groups.google.com/g/openalex-users/c/JuC50PvvpGY
          json_concept = JSON.parse(concept.replaceAll(`\\\\`, `\\`));
        } catch (err) {
          console.error(`JSON entity could not be parsed:\n`, concept);
          throw err;
        }
      }
      // console.log(json_concept);
      if (json_concept.level <= maxLevel) {
        pendingEdits.push(...importConceptToTheDatabase(json_concept));
        if (pendingEdits.length > 1_000) {
          await pushEdits();
        }
      }
    }
  }
  await pushEdits();
  await lastPromise;
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

/** Check the state of a promise */
function promiseState(promise: Promise<unknown>): Promise<{status: "fulfilled"|"rejected"|"pending", value?: unknown, reason?: unknown}> {
  const pendingState = { status: "pending" as const };

  return Promise.race([promise, pendingState]).then(
    (value) =>
      value === pendingState ? pendingState : { status: "fulfilled" as const, value },
    (reason) => ({ status: "rejected" as const, reason }),
  );
}


// await download_things('institutions')
await import_concepts();
