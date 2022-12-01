import { api } from "./neolace-api-client.ts";
import { DehydratedInstitution } from "./institutions-import.ts";
import { schema } from "./schema.ts";
import { getIdFromUrl, getIdFromUrlIfSet, getWikipediaIdFromUrl, setDateProperty, setIntegerProperty, setStringProperty } from "./utils.ts";

export interface DehydratedAuthor {
  "id": string;
  "orcid"?: string;
  "display_name": string;  
}

export interface Author extends DehydratedAuthor {
  "display_name_alternatives"?: string[]; // TODO add 
  "works_count": number;
  "cited_by_count": number;
  "ids": {
    "openalex": string;
    "orcid"?: string;
    "mag"?: string;
    "twitter"?: string; // TODO: ADD
    "wikipedia"?: string;
    "scopus"?: string;
  };
  "last_known_institution": DehydratedInstitution;
  "counts_by_year": {
    "year": number,
    "works_count": number,
    "cited_by_count": number
  }[];
  "works_api_url"?: string;
  "created_date"?: string;
  "updated_date"?: string;
}

const entryTypeKey = schema.author;

export function importAuthor(author: Author): api.AnyBulkEdit[] {
    const entryKey = getIdFromUrl(author.id);

    // Generate the "bulk edits" to create/update this concept:
    const edits: api.AnyBulkEdit[] = [
      {
        code: "UpsertEntryByKey",
        data: {
          where: { entryKey, entryTypeKey },
          set: {
            name: author.display_name,
          },
        },
      },
      {
        code: "SetPropertyFacts",
        data: {
          entryWith: { entryKey },
          set: [
            // ORCID:
            setStringProperty(schema.orcid, getIdFromUrlIfSet(author.orcid)),
            // Works count
            setIntegerProperty(schema.works_count, author.works_count),
            // Cited by count
            setIntegerProperty(schema.cited_by_count, author.cited_by_count),
            // MAG ID:
            setIntegerProperty(schema.mag_id, author.ids.mag ? parseInt(author.ids.mag, 10) : undefined),
            // Wikipedia ID:
            setStringProperty(schema.wikipedia_id, getWikipediaIdFromUrl(author.ids.wikipedia)),
            // Scopus Author ID, e.g. "http://www.scopus.com/inward/authorDetails.url?authorID=36455008000&partnerID=MN8TOARS"
            setStringProperty(schema.scopus_id, author.ids.scopus ? new URL("author.ids.scopus").searchParams.get("authorID")! : undefined),
            //  set the updated date
            setDateProperty(schema.updated_date, author.updated_date),
          ],
        },
      },
    ];


    // link the last known institution
    if (author.last_known_institution) {
      // Make sure the last known institution exists:
      const institutionKey = getIdFromUrl(author.last_known_institution.id);
      edits.push({code: "UpsertEntryByKey", data: {
        where: { entryTypeKey: schema.institution, entryKey: institutionKey },
        setOnCreate: {
          name: author.last_known_institution.display_name,
        },
      }});
      // Then link it to this author:
      edits.push({code: "SetRelationships", data: {
        entryWith: { entryKey },
        set: [
          {
            propertyKey: schema.last_known_institution,
            toEntries: [{entryWith: {entryKey: institutionKey}}],
          }
        ],
      }});
    }
    
    return edits;
}

