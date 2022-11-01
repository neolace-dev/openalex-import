#!/usr/bin/env deno run --import-map=import_map.json --allow-net --allow-read --allow-write --allow-env --unstable --no-check
import { S3Client } from "https://deno.land/x/s3_lite_client@0.2.0/mod.ts";
import { dirname } from "https://deno.land/std@0.125.0/path/mod.ts";
import { gunzip } from "https://deno.land/x/compress@v0.4.1/mod.ts";
import { Concept, importConceptToTheDatabase } from "./concept-import.ts"
import { DehydratedInstitution, importInstitutionToTheDatabase } from "./institutions-import.ts"
import { Author, importAuthorToTheDatabase } from "./authors-import.ts"
import { Venue } from "./venue-import.ts"
import { Work } from "./works-import.ts"

import { api, VNID, getApiClient } from "./neolace-api-client.ts";
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
  venue: VNID("_5X3C4f0mDy9RKziLpP1Few"),
  issn_l: VNID("_6iPoU1dsJEyMK6Ui23FtC3"),
  issn: VNID("_6y3Gun1pkTNoe2F4mQ34i7"),
  counts_by_year: VNID("_iuTgSAnr6HWgJcPGUt7FT"),
  works_api_url: VNID("_2lcWYtipXp6wruM1Euu0GT"),
  doi: VNID("_3W6WCrZ6Q5gfWZI4oHdHOQ"),
  title: VNID("_4jbPlGqe23uxRfDoWLH7MI"),
  publication_year: VNID("_2BGNyG50drPYgjTLIrEaSF"),
  publication_date: VNID("_1VB9bSjlIEcscflCZW5HhL"),
  pmid: VNID("_1PGQimSDXfHUcWSiNTU2h0"),
  pmcid: VNID("_6wAsbN1UGoBs0ImFU9GJAJ"),
  is_oa: VNID("_2OidkpKVLC8W5B3xjvJaH4"),
  oa_status: VNID("_2SHHV1zaxkLuZDipZWsPqy"),
  oa_url: VNID("_6nEVzwO5Dk5LfccIdecfy6"),
  is_retracted: VNID("_2cGjybttDOgsmm6kUe5rqx"),
  is_paratext: VNID("_13TQUi0GMmUCxX1HEdGuF8"),
}

type PropertyValue = string | number | undefined;
type Entity = Concept | DehydratedInstitution | Author | Venue | Work;

export async function findOrCreateEntry(entry_id: string, entity_type_id: VNID, entity: Entity): 
  Promise<{ 
      edits: api.AnyContentEdit[], 
      neolaceId: VNID, 
      isNewEntry: boolean
  }> {
  const client = await getApiClient();
  let neolaceId;
  const edits: api.AnyContentEdit[] = [];
  let isNewEntry = false;

  try {
    const entry = await client.getEntry(entry_id);
    console.log(`   entry ${entry_id} already exists.`);
    neolaceId = entry.id;
  } catch (error) {
    if (error instanceof api.NotFound) {
      //  create a new entry
      neolaceId = VNID();
      edits.push(
        {
          code: api.CreateEntry.code,
          data: {
            id: neolaceId,
            friendlyId: entry_id,
            name: entity.display_name,
            type: entity_type_id, 
            description: ("description" in entity && entity.description) || "",
          },
        },
      );
      isNewEntry = true;
    } else {
      throw error;
    }
  }

  return {
    edits: edits,
    neolaceId: neolaceId,
    isNewEntry: isNewEntry,
  }
} 

/*
that does nothing if relationship exists and is correct
deletes relationship that is not in the new list
creates relationship when there is no relationship.
ASSUMES that reflective relationship are automatic.
Only works for one rel type. Apply this function to each rel type then.
Does NOT work for bi-directional rels.
*/
export async function updateRelatinoships(relation_id: VNID, this_id: VNID, new_rel_set: Set<VNID>, new_entry = false) {
  const edits: api.AnyContentEdit[] = [];
  const addPropertyValueEditRel = addPropertyValueEdit(this_id);
  // get list of rels and loop through existing rels and make list of rels to delete and list of rels to add
  if (new_entry == true) {
    //  if the entry is new, it does not yet exists and we need to add all new relationships in any case
    for (const rel_id of new_rel_set) {
      edits.concat(addPropertyValueEditRel(relation_id, `[[/entry/${rel_id}]]`, true));
    }
  } else {
    const existing_rels = await getExistingRelationshipsOfType(relation_id, this_id);
    const rels_to_delete: VNID[] = [];
    const rels_to_add: VNID[] = [];
    existing_rels.forEach((existing_rel) => {
      if (!new_rel_set.has(existing_rel)) {
        rels_to_delete.push(existing_rel);
      }
    });
    new_rel_set.forEach((new_rel) => {
      if (!existing_rels.has(new_rel)) {
        rels_to_add.push(new_rel);
      }
    })
    // delete rels to delete
    for (const rel_id of rels_to_delete) {
      //  TODO when this is implemented
    }
    // add rels to add
    for (const rel_id of rels_to_add) {
      edits.concat(addPropertyValueEditRel(relation_id, `[[/entry/${rel_id}]]`, true));
    }
  }
  return edits;
}

//  return set of destination ids for existing relaitonships of type
async function getExistingRelationshipsOfType(relation_id: VNID, from_id: VNID): Promise<Set<VNID>> {
  const rel_set: Set<VNID> = new Set();
  const client = await getApiClient();
  const result = await client.evaluateLookupExpression(`this.get(prop=[[/prop/${relation_id}]])`, {entryKey: from_id});
  if (result.resultValue.type == "Page") {
    for (let entry of result.resultValue.values) {
      if (entry.type == "Annotated") {
        entry = entry.value;
      }
      if (entry.type == "Entry") {
        rel_set.add(entry.id);
      } else {
        console.log(entry)
        throw new Error("Unexpeted type");
      }
    }
  }
  return rel_set;
}

//  TODO delete this function?
export async function checkIfRelatinshipExists(relation_id: VNID, from_id: VNID, to_id: VNID): Promise<boolean> {
  let relationship_exists = false;
  const rel_list = await getExistingRelationshipsOfType(relation_id, from_id);
  for (const id of rel_list) {
    if (id == to_id) {
      relationship_exists = true;
      break;
    }
  }
  return relationship_exists;
}

export function addPropertyValueEdit(
  neolaceId: VNID,
): (property_id: VNID, value: PropertyValue, expression?: boolean) => api.AnyContentEdit[] {
  return (property_id: VNID, value: PropertyValue, expression = false): api.AnyContentEdit[] => {
    const edits: api.AnyContentEdit[] = []; 
    if (value) {
      edits.push({
        code: "AddPropertyValue",
        data: {
          property: property_id,
          entry: neolaceId,
          valueExpression: (expression || typeof value == "number") ? `${value}` : `"${value}"`,
          propertyFactId: VNID(),
          note: "",
        },
      });
    }
    return edits;
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
    console.log(path);
    const curr_obj = await Deno.readFile(path);
    const curr_file = gunzip(curr_obj);
    const curr_string = new TextDecoder().decode(curr_file); // BUG deno bug occurs here
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
// await download_things('authors');
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

await import_entities(
  "concepts",
  importConceptToTheDatabase,
  (concept) => {
    return concept.level == 2;
  }
)




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

