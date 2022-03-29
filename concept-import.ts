import { api, getApiClient, VNID } from "./neolace-api-client.ts";
import { addPropertyValueEdit, schema, updateRelatinoships, findOrCreateEntry } from "./openalex-import.ts"
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

    //  find or create a new entry
    const edits: api.AnyContentEdit[] = [];

    const result = await findOrCreateEntry(id, concept);
    edits.concat(result.edits);
    const neolaceId = result.neolaceId;
    const isNewEntry = result.isNewEntry;

    // add property values
    const addPropertyForConcept = addPropertyValueEdit(neolaceId);

    //  set the wikidata id
    if (concept.wikidata) {
      edits.concat(addPropertyForConcept(schema.wikidata, concept.wikidata.split("/").pop()));
    }
    //  set the level
    edits.concat(addPropertyForConcept(schema.level, concept.level));
    //  set the works count
    edits.concat(addPropertyForConcept(schema.works_count, concept.works_count));
    //  set the microsoft academic graph id
    edits.concat(addPropertyForConcept(schema.mag_id, concept.ids.mag));
    //  set the wikipedia id
    if (concept.ids.wikipedia) {
      edits.concat(
        addPropertyForConcept(
          schema.wikipedia_id, 
          (concept.ids.wikipedia.split("/").pop() as string).replace("%20", "_")
        )
      );
    }
    //  set the updated date
    if (concept.updated_date) {
      edits.concat(addPropertyForConcept(schema.updated_date, concept.updated_date));
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

