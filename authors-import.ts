import { api, getApiClient, VNID } from "./neolace-api-client.ts";
import { Institution } from "./institutions-import.ts"
import { addPropertyValueEdit, schema, updateRelatinoships } from "./openalex-import.ts"
type NominalType<T, K extends string> = T & { nominal: K };
type VNID = NominalType<string, "VNID">;

export interface Author {
  "id": string;
  "orcid": string;
  "display_name": string;
  "display_name_alternatives": string[]; // TODO add 
  "works_count": number;
  "cited_by_count": number;
  "ids": {
    "openalex": string;
    "orcid": string;
    "mag": number;
    "twitter": string; //TODO ADD
    "wikipedia": string;
    "scopus": string;
  };
  "last_known_institution": {
    "id": string,
    "ror": string,
    "display_name": string,
    "country_code": string,
    "type": string
  };
  "countr_by_year": {
    "year": number,
    "works_count": number,
    "cited_by_count": number
  }[];
  "works_api_url": string;
  "created_date": string;
  "updated_date"?: string;
}

export async function importAuthorToTheDatabase(author: Author) {
    const client = await getApiClient();
    const id = author.id.split("/").pop() as string;
    //  create a new entry
    let neolaceId;
    const edits: api.AnyContentEdit[] = [];
    let isNewEntry = false;

    try {
      const entry = await client.getEntry(id);
      console.log(`   entry ${id} already exists.`);
      neolaceId = entry.id;
    } catch (error) {
      if (error instanceof api.NotFound) {
        //  create a new entry
        neolaceId = VNID();
        edits.push(
          {
            code: api.CreateEntry.code,
            data: {
              id: neolaceId,
              friendlyId: id,
              name: author.display_name,
              type: schema.author, 
              description: "",
            },
          },
        );
        isNewEntry = true;
      } else {
        throw error;
      }
    }


    // const schema = await (await client.getSiteSchema("openalex"));
    // Object.values(schema.properties)

    const addPropertyValueEditForAuthor = addPropertyValueEdit(edits, neolaceId)

    addPropertyValueEditForAuthor(schema.orcid, author.orcid);
    addPropertyValueEditForAuthor(schema.works_count, author.works_count);
    addPropertyValueEditForAuthor(schema.cited_by_count, author.cited_by_count);
    addPropertyValueEditForAuthor(schema.mag_id, author.ids.mag);
    addPropertyValueEditForAuthor(schema.wikipedia_id, 
      (author.ids.wikipedia.split("/").pop() as string).replace("%20", "_")
    );
    addPropertyValueEditForAuthor(schema.scopus_id, author.ids.scopus);
    addPropertyValueEditForAuthor(schema.updated_date, author.updated_date);

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
          const addPropertyValueEditInst = addPropertyValueEdit(edits, institution_vnid)
          addPropertyValueEditInst(schema.ror, author.last_known_institution.ror);
          addPropertyValueEditInst(schema.country_code, author.last_known_institution.country_code);
          addPropertyValueEditInst(schema.institution_type, author.last_known_institution.type);
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

