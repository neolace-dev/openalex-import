import { api, getApiClient, VNID } from "./neolace-api-client.ts";
import { addPropertyValueEdit, schema, updateRelatinoships } from "./openalex-import.ts"
type NominalType<T, K extends string> = T & { nominal: K };
type VNID = NominalType<string, "VNID">;

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

    let edits: api.AnyContentEdit[] = [];
    let neolaceId;
    let isNewEntry = false;

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
              type: schema.institution, 
              description: "",
            },
          },
        ];
        isNewEntry = true;
      } else {
        throw error;
      }
    }

    const addPropertyValueEditForAuthor = addPropertyValueEdit(edits, neolaceId)

    if (institution.ids.wikidata) {
      addPropertyValueEditForAuthor(schema.wikidata, institution.ids.wikidata.split("/").pop());
    }
    addPropertyValueEditForAuthor(schema.works_count, institution.works_count);
    addPropertyValueEditForAuthor(schema.mag_id, institution.ids.mag);
    if (institution.ids.wikipedia) {
      addPropertyValueEditForAuthor(
        schema.wikipedia_id, 
        (institution.ids.wikipedia.split("/").pop() as string).replace("%20", "_")
      );
    }
    addPropertyValueEditForAuthor(schema.updated_date, institution.updated_date);
    addPropertyValueEditForAuthor(schema.ror, institution.ids.ror);
    addPropertyValueEditForAuthor(schema.country_code, institution.geo.country_code);
    addPropertyValueEditForAuthor(schema.institution_type, institution.type);

    const associated_institutions = (institution.associated_institutions ?? []);

    const ass_inst_parent_set = new Set<VNID>();
    const ass_inst_related_set = new Set<VNID>();

    for (const associated_institution of associated_institutions) {
      const ass_inst_id = associated_institution.id.split("/").pop() as string;
      let entry_vnid;
      
      try {
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
                        type: schema.institution, 
                        description: "",
                    },
                },
            )
        } else {
          throw error;
        }
      }
      if (associated_institution.relationship == "parent") {
        ass_inst_parent_set.add(entry_vnid);
      } else if (associated_institution.relationship == "related") {
        ass_inst_related_set.add(entry_vnid);
      }
    }

    edits.concat(
      await updateRelatinoships(schema.parent_institutions, neolaceId, ass_inst_parent_set, isNewEntry)
    );
    edits.concat(
      await updateRelatinoships(schema.related_institutions, neolaceId, ass_inst_related_set, isNewEntry)
    );

    const { id: draftId } = await client.createDraft({
      title: "import concept",
      description: "",
      edits,
    });

    try {
      await client.acceptDraft(draftId);
    } catch {
      console.log(edits)
    }
}
