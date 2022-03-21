import { api, getApiClient, VNID } from "./neolace-api-client.ts";

enum InstitutionType {
    education = "education",
    healthcare = "healthcare",
    company = "company",
    archive = "archive",
    nonprofit = "nonprofit",
    government = "government",
    facility = "facility",
    other = "other"
}

export interface Institution {
    "id": string;
    "ror": string;
    "display_name": string;
    "country_code": string;
    "type": InstitutionType;
    "homepage_url": string;
    "image_url": string;
    "image_thumbnail_url": string;
    "display_name_acronyms": string[];
    "display_name_alternatives": string[];
    "works_count": number;
    "cited_by_count": number;
    "ids": {
        "openalex": string;
        "ror"?: string;
        "mag"?: string;
        "grid"?: string;
        "wikipedia"?: string;
        "wikidata"?: string;
    };
    "geo" : {
        "city"?: string;
        "geonames_city_id"?: number;
        "region"?: string;
        "country_code"?: string;
        "country"?: string;
        "latitude"?: number;
        "longitude"?: number;
    }
    "international": {
        "description": {
          [languageId: string]: string;
        };
        "display_name": {
          [languageId: string]: string;
        };
      };
    "associated_institutions": {
        "id": string;
        "ror": string;
        "display_name": string;
        "country_code": string;
        "type": InstitutionType;
        "relationship": "parent" | "child" | "related";
    }[];
    "counts_by_year": {
        "year": number;
        "works_count": number;
        "cited_by_count": number;
    }[];
    "works_api_url": string;
    "updated_date"?: string;
    "created_date"?: string;
}

export async function importInstitutionToTheDatabase(institution: Institution) {
    const client = await getApiClient();
    const id = institution.id.split("/").pop() as string;

    let edits: api.AnyContentEdit[] = []
    let neolaceId

    try {
      const entry = await client.getEntry(id);
      console.log(`   entry ${id} already exists.`);
      neolaceId = entry.id;
    } catch (error) {
      if (error instanceof api.NotFound) {
        //  create a new entry
        neolaceId = VNID();
        edits = [
          {
            code: api.CreateEntry.code,
            data: {
              id: neolaceId,
              friendlyId: id,
              name: institution.display_name,
              type: VNID("_6IBiJrvrPmEDXVCpdphja2"), 
              description: "",
            },
          },
        ];
      } else {
        throw error;
      }
    }

    //  set the wikidata id
    if (institution.ids.wikidata) {
      edits.push({
        code: "AddPropertyValue",
        data: {
          property: VNID("_63mbf1PWCiYQVs53ef3lcp"), 
          entry: neolaceId,
          valueExpression: `"${institution.ids.wikidata.split("/").pop()}"`,
          propertyFactId: VNID(),
          note: "",
        },
      });
    }

    //  set the works count
    edits.push({
      code: "AddPropertyValue",
      data: {
        property: VNID("_4OujpOZawdTunrjtSQrPcb"),
        entry: neolaceId,
        valueExpression: `"${institution.works_count}"`,
        propertyFactId: VNID(),
        note: "",
      },
    });

    //  set the microsoft academic graph id
    if (institution.ids.mag) {
      edits.push({
        code: "AddPropertyValue",
        data: {
          property: VNID("_1i2GXNofq5YEgaA3R9F4KN"),
          entry: neolaceId,
          valueExpression: `"${institution.ids.mag}"`,
          propertyFactId: VNID(),
          note: "",
        },
      });
    }

    //  set the wikipedia id
    if (institution.ids.wikipedia) {
      edits.push({
        code: "AddPropertyValue",
        data: {
          property: VNID("_468JDObMgV93qhEfHSAWnr"),
          entry: neolaceId,
          valueExpression: `"${
            (institution.ids.wikipedia.split("/").pop() as string).replace("%20", "_")
          }"`,
          propertyFactId: VNID(),
          note: "",
        },
      });
    }

    //  set the updated date
    if (institution.updated_date) {
      edits.push({
        code: "AddPropertyValue",
        data: {
          property: VNID("_1M7JXgQKUfgSageiKdR82T"),
          entry: neolaceId,
          valueExpression: `"${institution.updated_date}"`,
          propertyFactId: VNID(),
          note: "",
        },
      });
    }

    const associated_institutions = (institution.associated_institutions ?? []);

    for (const associated_institution of associated_institutions) {
      const ass_inst_id = associated_institution.id.split("/").pop() as string;
      let entry_vnid;

      try {
        //  TODO check if the relationship already exists
        entry_vnid = (await client.getEntry(ass_inst_id)).id;
      } catch (error) {
        if (error instanceof api.NotFound) {
            //  create a new entry
            entry_vnid = VNID();
            edits.push({
                    code: api.CreateEntry.code,
                    data: {
                        id: entry_vnid,
                        friendlyId: ass_inst_id,
                        name: associated_institution.display_name,
                        type: VNID("_6IBiJrvrPmEDXVCpdphja2"), 
                        description: "",
                    },
                },
            )
        } else {
          throw error;
        }
      }

      let relation_id;
      if (associated_institution.relationship == "child") {
          continue; // child relationships are computed automatically
      } else if (associated_institution.relationship == "parent") {
          relation_id = VNID("_2WcngIq4qAP8jYL0W1o7iK");
      } else if (associated_institution.relationship == "related") {
          relation_id = VNID("_2tGs933dsiNrejnlX8C1cS");
      } else {
          throw new Error("Invalid relationship type.");
      }

      edits.push({
        code: "AddPropertyValue",
        data: {
          property: relation_id,
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
