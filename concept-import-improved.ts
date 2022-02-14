import { api, getApiClient, VNID } from "./neolace-api-client.ts";

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
    const neolaceId = VNID();
    const edits: api.AnyContentEdit[] = [
      {
        code: api.CreateEntry.code,
        data: {
          id: neolaceId,
          friendlyId: id,
          name: concept.display_name,
          type: VNID("_vj4bFX3CVAGMis4aiL4AJ"),
          description: concept.description ?? "",
        },
      },
    ];

    //  set the wikidata id
    if (concept.wikidata) {
      edits.push({
        code: "AddPropertyValue",
        data: {
          property: VNID("_63mbf1PWCiYQVs53ef3lcp"),
          entry: neolaceId,
          valueExpression: `"${concept.wikidata.split("/").pop()}"`,
          propertyFactId: VNID(),
          note: "",
        },
      });
    }

    //  set the level
    edits.push({
      code: "AddPropertyValue",
      data: {
        property: VNID("_3AyM6hRQL23PhhHZrboCYr"),
        entry: neolaceId,
        valueExpression: `"${concept.level}"`,
        propertyFactId: VNID(),
        note: "",
      },
    });

    //  set the works count
    edits.push({
      code: "AddPropertyValue",
      data: {
        property: VNID("_4OujpOZawdTunrjtSQrPcb"),
        entry: neolaceId,
        valueExpression: `"${concept.works_count}"`,
        propertyFactId: VNID(),
        note: "",
      },
    });

    //  set the microsoft academic graph id
    if (concept.ids.mag) {
      edits.push({
        code: "AddPropertyValue",
        data: {
          property: VNID("_1i2GXNofq5YEgaA3R9F4KN"),
          entry: neolaceId,
          valueExpression: `"${concept.ids.mag}"`,
          propertyFactId: VNID(),
          note: "",
        },
      });
    }

    //  set the wikipedia id
    if (concept.ids.wikipedia) {
      edits.push({
        code: "AddPropertyValue",
        data: {
          property: VNID("_468JDObMgV93qhEfHSAWnr"),
          entry: neolaceId,
          valueExpression: `"${
            (concept.ids.wikipedia.split("/").pop() as string).replace("%20", "_")
          }"`,
          propertyFactId: VNID(),
          note: "",
        },
      });
    }

    //  set the updated date
    if (concept.updated_date) {
      edits.push({
        code: "AddPropertyValue",
        data: {
          property: VNID("_1M7JXgQKUfgSageiKdR82T"),
          entry: neolaceId,
          valueExpression: `"${concept.updated_date}"`,
          propertyFactId: VNID(),
          note: "",
        },
      });
    }

    // deno-lint-ignore no-explicit-any
    const parents = (concept.ancestors ?? []).filter((a: any) =>
      a.level === concept.level - 1
    );

    for (const ancestor of parents) {
      const ancestor_id = ancestor.id.split("/").pop() as string;
      const entry_vnid = (await client.getEntry(ancestor_id)).id;

      edits.push({
        code: "AddPropertyValue",
        data: {
          property: VNID("_1uwLIPU2RI457BkrPs3rgM"),
          entry: neolaceId,
          valueExpression: `[[/entry/${entry_vnid}]]`,
          propertyFactId: VNID(),
          note: "",
        },
      });
    }

    const { id: draftId } = await client.createDraft({
      title: "import concept",
      description: "",
      edits,
    });
    await client.acceptDraft(draftId);
}

