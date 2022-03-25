#!/usr/bin/env deno run --import-map=import_map.json --allow-net --allow-read --allow-write --allow-env --unstable --no-check
import { S3Client } from "https://deno.land/x/s3_lite_client@0.2.0/mod.ts";
import { dirname } from "https://deno.land/std@0.125.0/path/mod.ts";
import { gunzip } from "https://deno.land/x/compress@v0.4.1/mod.ts";
import { importConceptToTheDatabase } from "./concept-import.ts"
import { importInstitutionToTheDatabase } from "./institutions-import.ts"

import { api, VNID } from "./neolace-api-client.ts";
type NominalType<T, K extends string> = T & { nominal: K };
type VNID = NominalType<string, "VNID">;

const s3client = new S3Client({
  endPoint: "s3.amazonaws.com",
  port: 443,
  useSSL: true,
  region: "us-east-1",
  bucket: "openalex",
  pathStyle: false,
});


export const schema = {
  concept: VNID("_vj4bFX3CVAGMis4aiL4AJ"),
  institution: VNID("_6IBiJrvrPmEDXVCpdphja2"),
  wikidata: VNID("_63mbf1PWCiYQVs53ef3lcp"),
  level: VNID("_3AyM6hRQL23PhhHZrboCYr"),
  works_count: VNID("_4OujpOZawdTunrjtSQrPcb"),
  mag_id: VNID("_1i2GXNofq5YEgaA3R9F4KN"),
  wikipedia_id: VNID("_468JDObMgV93qhEfHSAWnr"),
  updated_date: VNID("_1M7JXgQKUfgSageiKdR82T"),
  ancestors: VNID("_1uwLIPU2RI457BkrPs3rgM"),
  related_concepts: VNID("_4wv8wdeT0B33FTQPBcAszM"),
  descendants: VNID("_5bqPhtxKnanIkfrOUuxq4M"),
  parent_institutions: VNID("_2WcngIq4qAP8jYL0W1o7iK"),
  child_institutions: VNID("_47ihemw9K882NvnTGklODY"),
  related_institutions: VNID("_2tGs933dsiNrejnlX8C1cS"),
  scopus_id: VNID("_67iX5qqVN01rUqWk85wzco"),
  author: VNID("_4dQI9bcpJaIbeg2GHgdPgf"),
  orcid: VNID("_7A5Wa42OstkFT0J5uSgQe7"),
  cited_by_count: VNID("_5jsjdLPAL9UK0i3WAQTWXK"),
  last_known_institution: VNID("_1JFqXKkYV2vYEjiHI1AS2F"),
  associated_author: VNID("_5l1iUSabWX3Oqglokv1JTZ"),
  ror: VNID("_40f9pqAoVezJMsluDEoX8R"),
  country_code: VNID("_1KL8Jd79CEYP4D0W2ae9jc"),
  institution_type: VNID("_4ri7I2Si8KbBzj6Ao36cLH"),
}

type PropertyValue = string | number | undefined;

export function addPropertyValueEdit(
  edits: api.AnyContentEdit[],
  neolaceId: VNID,
): (property_id: VNID, value: PropertyValue) => void {
  return (property_id: VNID, value: PropertyValue) => {
    if (value) {
      edits.push({
        code: "AddPropertyValue",
        data: {
          property: property_id,
          entry: neolaceId,
          valueExpression: `"${value}"`,
          propertyFactId: VNID(),
          note: "",
        },
      })
    }
  };
}

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




