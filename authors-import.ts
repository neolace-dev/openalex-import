import { api, getApiClient, VNID } from "./neolace-api-client.ts";
import { DehydratedInstitution } from "./institutions-import.ts"
import { addPropertyValueEdit, schema, updateRelatinoships, findOrCreateEntry } from "./openalex-import.ts"
type NominalType<T, K extends string> = T & { nominal: K };
type VNID = NominalType<string, "VNID">;

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
    "mag"?: number;
    "twitter"?: string; //TODO ADD
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

export async function importAuthorToTheDatabase(author: Author) {
    const client = await getApiClient();
    const id = author.id.split("/").pop() as string;
    //  find or create a new entry
    const edits: api.AnyContentEdit[] = [];
    const result = await findOrCreateEntry(id, author);
    edits.concat(result.edits);
    const neolaceId = result.neolaceId;
    const isNewEntry = result.isNewEntry;

    // const schema = await (await client.getSiteSchema("openalex"));
    // Object.values(schema.properties)

    const addPropertyForAuthor = addPropertyValueEdit(neolaceId)

    edits.concat(addPropertyForAuthor(schema.orcid, author.orcid));
    edits.concat(addPropertyForAuthor(schema.works_count, author.works_count));
    edits.concat(addPropertyForAuthor(schema.cited_by_count, author.cited_by_count));
    edits.concat(addPropertyForAuthor(schema.mag_id, author.ids.mag));
    if (author.ids.wikipedia) {
      edits.concat(
        addPropertyForAuthor(schema.wikipedia_id, 
          (author.ids.wikipedia.split("/").pop() as string).replace("%20", "_")
        )
      );
    }
    edits.concat(addPropertyForAuthor(schema.scopus_id, author.ids.scopus));
    edits.concat(addPropertyForAuthor(schema.updated_date, author.updated_date));

    // link the last known institution
    if (author.last_known_institution) {
      // check if institution exists
      const institution_id = author.last_known_institution.id;
      const institution_name = author.last_known_institution.display_name

      let institution_vnid;
      try {
        const institution = await client.getEntry(institution_id);
        institution_vnid = institution.id;

      } catch (error) {
        if (error instanceof api.NotFound) {
          //  create institution stub
          institution_vnid = VNID();
          edits.push(
            {
              code: api.CreateEntry.code,
              data: {
                id: institution_vnid,
                friendlyId: institution_id,
                name: institution_name,
                type: schema.institution, 
                description: "",
              },
            },
          );

          // add included properties to last known institution stub entry
          const addPropertyValueEditInst = addPropertyValueEdit(institution_vnid)
          edits.concat(addPropertyValueEditInst(schema.ror, author.last_known_institution.ror));
          edits.concat(addPropertyValueEditInst(schema.country_code, author.last_known_institution.country_code));
          edits.concat(addPropertyValueEditInst(schema.institution_type, author.last_known_institution.type));
        } else {
          throw error;
        }
      }
      // add creating the relationship to edits
      edits.concat(
        await updateRelatinoships(
          schema.last_known_institution, 
          neolaceId, 
          new Set<VNID>().add(institution_vnid), 
          isNewEntry
        )
      );
    }
    
    const { id: draftId } = await client.createDraft({
      title: "import concept",
      description: "",
      edits,
    });
    await client.acceptDraft(draftId);
}

