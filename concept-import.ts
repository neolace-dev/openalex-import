import { api, VNID } from "./neolace-api-client.ts";

export interface Concept {
  "id": string;
  "display_name": string;
  "wikidata": string;
  // "relevance_score":null;
  "level": number;
  "description": string | null;
  "works_count": number;
  "cited_by_count": number;
  "ids": {
    "openalex": string;
    "wikidata": string;
    "wikipedia": string;
    "umls_aui": string[];
    "umls_cui": string[];
    "mag": string;
  };
  "image_url": string;
  "image_thumbnail_url": string;
  "international": {
    "description": {
      [languageId: string]: string;
    };
    "display_name": {
      [languageId: string]: string;
    };
  };
  "ancestors": {
    "level": number;
    "wikidata": string;
    "id": string;
    "display_name": string;
  }[];
  "related_concepts": {
    "id": string;
    "score": number;
    "wikidata": string | null;
    "level": number;
    "display_name": string;
  }[];
  "works_api_url": string;
  "updated_date"?: string;
}

const conceptEntryTypeId = VNID("_vj4bFX3CVAGMis4aiL4AJ");

const stripUrlFromId = (url: string) => url.split("/").pop()!;

export function importConceptToTheDatabase(concept: Concept): api.AnyBulkEdit[] {
    const id = stripUrlFromId(concept.id);

    // Generate the "bulk edits" to create/update this concept:
    const edits: api.AnyBulkEdit[] = [
      {
        code: "UpsertEntryByFriendlyId",
        data: {
          where: {
            friendlyId: id,
            entryTypeId: conceptEntryTypeId,
          },
          set: {
            name: concept.display_name,
            description: concept.description ?? "",
          },
        },
      },
      {
        code: "SetPropertyFacts",
        data: {
          entryWith: { friendlyId: id },
          set: [
            // Wikidata ID:
            {
              propertyId: VNID("_63mbf1PWCiYQVs53ef3lcp"), // Wikidata ID
              facts: concept.wikidata ? [{valueExpression: `"${concept.wikidata.split("/").pop()}"`}] : []
            },
            // Level:
            {
              propertyId: VNID("_3AyM6hRQL23PhhHZrboCYr"), // Level
              facts: [{ valueExpression: `${concept.level}` }]
            },
            // Works count:
            {
              propertyId: VNID("_4OujpOZawdTunrjtSQrPcb"),
              facts: [{ valueExpression: `${concept.works_count}` }]
            },
            //  set the microsoft academic graph id
            {
              propertyId: VNID("_1i2GXNofq5YEgaA3R9F4KN"),
              facts: concept.ids.mag ? [{valueExpression: `"${concept.ids.mag}"`}] : []
            },
            //  set the wikipedia id
            {
              propertyId: VNID("_468JDObMgV93qhEfHSAWnr"),
              facts: concept.ids.wikipedia ? [{valueExpression: `"${
                (concept.ids.wikipedia.split("/").pop() as string).replace("%20", "_")
              }"`}] : []
            },
            //  set the updated date
            {
              propertyId: VNID("_1M7JXgQKUfgSageiKdR82T"),
              // Note: some "updated_date" are actually updated_datetime values like "2022-10-09T09:37:13.298106"
              // but since we don't support datetimes yet, we strip off the time information.
              facts: concept.updated_date ? [{valueExpression: `date("${concept.updated_date.substring(0,10)}")`}] : []
            },
          ],
        },
      },
    ];

    const parents = (concept.ancestors ?? []).filter((a: {level: number}) => a.level === concept.level - 1);

    // Make sure the parents exist:
    for (const parent of parents) {
      edits.push({code: "UpsertEntryByFriendlyId", data: {
        where: { entryTypeId: conceptEntryTypeId, friendlyId: stripUrlFromId(parent.id) },
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
          entryWith: { friendlyId: id },
          set: [
            {
              propertyId: VNID("_1uwLIPU2RI457BkrPs3rgM"), // "Parent Concept" property
              toEntries: parents.map((parent) => ({ entryWith: { friendlyId: stripUrlFromId(parent.id) } })),
            }
          ],
        },
      },
    );
    return edits;
}

