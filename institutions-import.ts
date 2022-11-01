import { api, getApiClient, VNID } from "./neolace-api-client.ts";
import { addPropertyValueEdit, schema, updateRelatinoships, findOrCreateEntry } from "./openalex-import.ts"
type NominalType<T, K extends string> = T & { nominal: K };
type VNID = NominalType<string, "VNID">;

export enum InstitutionType {
    education = "education",
    healthcare = "healthcare",
    company = "company",
    archive = "archive",
    nonprofit = "nonprofit",
    government = "government",
    facility = "facility",
    other = "other"
}

export interface DehydratedInstitution {
  "id": string;
  "ror"?: string;
  "display_name": string;
  "country_code"?: string;
  "type": InstitutionType;
}
export interface Institution extends DehydratedInstitution {

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
    "associated_institutions": (DehydratedInstitution & {   
        "relationship": "parent" | "child" | "related";
    })[];
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
    const edits: api.AnyContentEdit[] = [];
    const id = institution.id.split("/").pop() as string;

    const result = await findOrCreateEntry(id, schema.institution, institution);
    edits.concat(result.edits);
    const neolaceId = result.neolaceId;
    const isNewEntry = result.isNewEntry;

    const addPropertyForAuthor = addPropertyValueEdit(neolaceId)

    if (institution.ids.wikidata) {
      edits.concat(addPropertyForAuthor(schema.wikidata, institution.ids.wikidata.split("/").pop()));
    }
    edits.concat(addPropertyForAuthor(schema.works_count, institution.works_count));
    edits.concat(addPropertyForAuthor(schema.mag_id, institution.ids.mag));
    if (institution.ids.wikipedia) {
      edits.concat(
        addPropertyForAuthor(
          schema.wikipedia_id, 
          (institution.ids.wikipedia.split("/").pop() as string).replace("%20", "_")
        )
      );
    }
    edits.concat(addPropertyForAuthor(schema.updated_date, institution.updated_date));
    edits.concat(addPropertyForAuthor(schema.ror, institution.ids.ror));
    edits.concat(addPropertyForAuthor(schema.country_code, institution.geo.country_code));
    edits.concat(addPropertyForAuthor(schema.institution_type, institution.type));

    const associated_institutions = (institution.associated_institutions ?? []);

    const ass_inst_parent_set = new Set<VNID>();
    const ass_inst_related_set = new Set<VNID>();

    for (const associated_institution of associated_institutions) {
      const ass_inst_id = associated_institution.id.split("/").pop() as string;
      const result = await findOrCreateEntry(ass_inst_id, schema.institution, associated_institution);
      const ass_inst_vnid = result.neolaceId;
      edits.concat(result.edits);
      const addPropertyValueEditInst = addPropertyValueEdit(ass_inst_vnid);
      edits.concat(addPropertyValueEditInst(schema.ror, associated_institution.ror));
      edits.concat(addPropertyValueEditInst(schema.country_code, associated_institution.country_code));
      edits.concat(addPropertyValueEditInst(schema.institution_type, associated_institution.type));

      if (associated_institution.relationship == "parent") {
        ass_inst_parent_set.add(ass_inst_vnid);
      } else if (associated_institution.relationship == "related") {
        ass_inst_related_set.add(ass_inst_vnid);
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
