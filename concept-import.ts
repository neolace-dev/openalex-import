import { api, getApiClient, VNID } from "./neolace-api-client.ts";
import { addPropertyValueEdit, schema, updateRelatinoships } from "./openalex-import.ts"
type NominalType<T, K extends string> = T & { nominal: K };
type VNID = NominalType<string, "VNID">;

export interface Concept {
  "id": string;
  "display_name": string;
  "wikidata"?: string;
  // "relevance_score":null;
  "level": number;
  "description"?: string | null;
  "works_count": number;
  "cited_by_count": number;
  "ids": {
    "openalex": string;
    "wikidata"?: string;
    "wikipedia"?: string;
    "umls_aui"?: string[];
    "umls_cui"?: string[];
    "mag"?: string;
  };
  "image_url"?: string;
  "image_thumbnail_url"?: string;
  "international"?: {
    "description": {
      [languageId: string]: string;
    };
    "display_name": {
      [languageId: string]: string;
    };
  };
  "ancestors": {
    "level": number;
    "wikidata"?: string;
    "id": string;
    "display_name": string;
  }[];
  "related_concepts"?: {
    "id": string;
    "score"?: number;
    "wikidata"?: string | null;
    "level": number;
    "display_name": string;
  }[];
  "works_api_url"?: string;
  "updated_date"?: string;
}

export async function importConceptToTheDatabase(concept: Concept) {
    const client = await getApiClient();
    const id = concept.id.split("/").pop() as string;
    try {
      await client.getEntry(id);
      console.log(`   entry ${id} already exists.`);
      return;
    } catch (error) {
      if (error instanceof api.NotFound) {
        //  this is good we have to create the entry.
      } else {
        throw error;
      }
    }

    //  create a new entry
    let neolaceId;
    const edits: api.AnyContentEdit[] = [];
    let isNewEntry = false;

    try {
      const entry = await client.getEntry(id);
      console.log(`   entry ${id} already exists.`);
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
              friendlyId: id,
              name: concept.display_name,
              type: schema.concept, 
              description: concept.description ?? "",
            },
          },
        );
        isNewEntry = true;
      } else {
        throw error;
      }
    }

    const addPropertyValueEditForConcept = addPropertyValueEdit(edits, neolaceId);

    //  set the wikidata id
    if (concept.wikidata) {
      addPropertyValueEditForConcept(schema.wikidata, concept.wikidata.split("/").pop());
    }
    //  set the level
    addPropertyValueEditForConcept(schema.level, concept.level);
    //  set the works count
    addPropertyValueEditForConcept(schema.works_count, concept.works_count);
    //  set the microsoft academic graph id
    addPropertyValueEditForConcept(schema.mag_id, concept.ids.mag);
    //  set the wikipedia id
    if (concept.ids.wikipedia) {
      addPropertyValueEditForConcept(
        schema.wikipedia_id, 
        (concept.ids.wikipedia.split("/").pop() as string).replace("%20", "_")
      );
    }
    //  set the updated date
    if (concept.updated_date) {
      addPropertyValueEditForConcept(schema.updated_date, concept.updated_date);
    }

    // deno-lint-ignore no-explicit-any
    const parents = (concept.ancestors ?? []).filter((a: any) =>
      a.level === concept.level - 1
    );

    const ancestor_set = new Set<VNID>();
    for (const ancestor of parents) {
      const ancestor_id = ancestor.id.split("/").pop() as string;
      const entry_vnid = (await client.getEntry(ancestor_id)).id;
      ancestor_set.add(entry_vnid);
    }
    edits.concat(await updateRelatinoships(schema.ancestors, neolaceId, ancestor_set, isNewEntry));

    const { id: draftId } = await client.createDraft({
      title: "import concept",
      description: "",
      edits,
    });
    await client.acceptDraft(draftId);
}

