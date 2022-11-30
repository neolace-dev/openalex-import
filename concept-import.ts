import { api } from "./neolace-api-client.ts";
import { schema } from "./schema.ts";
import { getIdFromUrl, getIdFromUrlIfSet, getWikipediaIdFromUrl, setDateProperty, setIntegerProperty, setStringProperty } from "./utils.ts";

export interface DehydratedConcept {
  "id": string;
  "display_name": string;
  "wikidata"?: string;
  "level": number;
}

export interface Concept extends DehydratedConcept {
  // "relevance_score":null;
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
  "related_concepts"?: (DehydratedConcept & {
    "score"?: number;
  })[];
  "works_api_url"?: string;
  "updated_date"?: string;
}

const entryTypeKey = schema.concept;

export function importConcept(concept: Concept): api.AnyBulkEdit[] {
    const entryKey = getIdFromUrl(concept.id);

    // Generate the "bulk edits" to create/update this concept:
    const edits: api.AnyBulkEdit[] = [
      {
        code: "UpsertEntryByKey",
        data: {
          where: { entryKey, entryTypeKey },
          set: {
            name: concept.display_name,
            description: concept.description ?? "",
          },
        },
      },
      {
        code: "SetPropertyFacts",
        data: {
          entryWith: { entryKey },
          set: [
            // Wikidata ID:
            setStringProperty(schema.wikidata, getIdFromUrlIfSet(concept.wikidata)),
            // Level:
            setIntegerProperty(schema.level, concept.level),
            // Works count:
            setIntegerProperty(schema.works_count, concept.works_count),
            //  set the microsoft academic graph id
            setIntegerProperty(schema.mag_id, concept.ids.mag ? parseInt(concept.ids.mag, 10) : undefined),
            //  set the wikipedia id
            setStringProperty(schema.wikipedia_id, getWikipediaIdFromUrl(concept.ids.wikipedia)),
            //  set the updated date
            setDateProperty(schema.updated_date, concept.updated_date),
          ],
        },
      },
    ];

    const parents = (concept.ancestors ?? []).filter((a: {level: number}) => a.level === concept.level - 1);

    // Make sure the parents exist:
    for (const parent of parents) {
      edits.push({code: "UpsertEntryByKey", data: {
        where: { entryTypeKey, entryKey: getIdFromUrl(parent.id) },
        setOnCreate: {
          // Only set these if the entry doesn't yet exist; otherwise use whatever values it already has.
          name: parent.display_name,
        },
      }});
    }

    // Set the parents:
    edits.push(
      {
        code: "SetRelationships",
        data: {
          entryWith: { entryKey },
          set: [
            {
              propertyKey: schema.parent_concept,
              toEntries: parents.map((parent) => ({ entryWith: { entryKey: getIdFromUrl(parent.id) } })),
            }
          ],
        },
      },
    );
    return edits;
}

