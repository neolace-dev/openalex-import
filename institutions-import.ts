import { api } from "./neolace-api-client.ts";
import { schema } from "./schema.ts";
import { getIdFromUrl, getIdFromUrlIfSet, getWikipediaIdFromUrl, setDateProperty, setIntegerProperty, setStringProperty } from "./utils.ts";

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

export function importInstitution(institution: Institution): api.AnyBulkEdit[] {
    const entryKey = getIdFromUrl(institution.id);
  
    const edits: api.AnyBulkEdit[] = [
      {
        code: "UpsertEntryByKey",
        data: {
          where: { entryTypeKey: schema.institution, entryKey },
          set: { name: institution.display_name },
        }
      },
      {
        code: "SetPropertyFacts",
        data: {
          entryWith: { entryKey },
          set: [
            // Wikidata ID:
            setStringProperty(schema.wikidata, getIdFromUrlIfSet(institution.ids.wikidata)),
            // MAG ID:
            setIntegerProperty(schema.mag_id, institution.ids.mag ? parseInt(institution.ids.mag, 10) : undefined),
            // ROR (Research Organization Registry) ID:
            setStringProperty(schema.ror, getIdFromUrlIfSet(institution.ids.ror)),
            // Country code:
            setStringProperty(schema.country_code, institution.geo.country_code),
            // Institution Type
            setStringProperty(schema.institution_type, institution.type),
            // Works count:
            setIntegerProperty(schema.works_count, institution.works_count),
            //  set the wikipedia id
            setStringProperty(schema.wikipedia_id, getWikipediaIdFromUrl(institution.ids.wikipedia)),
            //  set the updated date
            setDateProperty(schema.updated_date, institution.updated_date),
          ],
        },
      }
    ];

    const associated_institutions = (institution.associated_institutions ?? []);

    const parentInstKeys: string[] = [];
    const relatedInstKeys: string[] = [];

    for (const associated_institution of associated_institutions) {
      const associatedInstKey = getIdFromUrl(associated_institution.id);
      // Make sure this associated institution exists:
      edits.push({code: "UpsertEntryByKey", data: {
        where: { entryTypeKey: schema.institution, entryKey: associatedInstKey },
        setOnCreate: { name: associated_institution.display_name },
      }});

      if (associated_institution.relationship == "parent") {
        parentInstKeys.push(associatedInstKey);
      } else if (associated_institution.relationship == "related") {
        relatedInstKeys.push(associatedInstKey);
      }
    }
    // Now set the relationships:
    edits.push({ code: "SetRelationships", data: {
        entryWith: { entryKey },
        set: [{
            propertyKey: schema.parent_institutions,
            toEntries: parentInstKeys.map((parentKey) => ({ entryWith: { entryKey: parentKey } })),
          }
        ],
    }});
    edits.push({ code: "SetRelationships", data: {
        entryWith: { entryKey },
        set: [{
            propertyKey: schema.related_institutions,
            toEntries: relatedInstKeys.map((parentKey) => ({ entryWith: { entryKey: parentKey } })),
          }
        ],
    }});

    return edits;
}
