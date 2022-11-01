import { api, getApiClient, VNID } from "./neolace-api-client.ts";
import { Institution, InstitutionType, DehydratedInstitution } from "./institutions-import.ts"
import { DehydratedAuthor } from "./authors-import.ts"
import { addPropertyValueEdit, schema, updateRelatinoships, findOrCreateEntry } from "./openalex-import.ts"
import { DehydratedVenue } from "./venue-import.ts"
import { DehydratedConcept } from "./concept-import.ts"
type NominalType<T, K extends string> = T & { nominal: K };
type VNID = NominalType<string, "VNID">;

interface Authorship extends DehydratedAuthor {
    "author_position": "first" | "middle" | "last";
    "institutions": DehydratedInstitution[];
    "raw_affiliation_string": string;
}

interface HostVenue extends DehydratedVenue {
    "url": string;
    "is_oa": boolean;
    "version": "publishedVersion" | "acceptedVersion" | "submittedVersion";
    "licence"?: string;  
    // NOTE there is also type field here, but it is not described
}

interface OpenAccess {
    "is_oa": boolean;
    "oa_status": "gold" | "green" | "hybrid" | "bronze" | "closed";
    "oa_url"?: string;
}

export interface Work {
    "id": string;
    "doi": string;
    "title": string;
    "display_name": string;
    "publication_year": number;
    "publication_date": string;
    "ids": {
        "openalex": string;
        "doi": string;
        "mag"?: string;
        "pmid"?: string;
        "pmcid"?: string;
    }
    "host_venue": HostVenue; // rel
    "type": string; // TODO add Crossref's controlled vocabulary // TODO add to schema
    "open_access": OpenAccess; 
    "authorships": Authorship[]; // ??? rel
    "cited_by_count": number;
    "biblio": { // TODO to add to schema
        "volume"?: string;
        "issue"?: string;
        "first_page"?: string;
        "last_page"?: string;
    }
    "is_retracted": boolean;
    "is_paratext": boolean;
    "concepts": (DehydratedConcept & { // rels
        "score": number;
    })[]
    "mesh"?: { // NOTE Mesh object from PubMed //TODO add to schema
        "descriptor_ui"?:  string,
        "descriptor_name"?:  string,
        "qualifier_ui"?:  string,
        "qualifier_name"?:  string,
        "is_major_topic"?:  boolean,
    }[];
    "alternate_host_venues": HostVenue[]; // rels
    "referenced_works": string[]; // list of openalex ids REL
    "related_works": string[]; //list of openalex ids REL
    "abstract_inverted_index": Record<string, number[]>; // ???
    //  "cired_by_api_url"
    // "counts_by_year"
    "updated_date"?: string;
    "created_date"?: string;
}

export async function importVanueToDatabase(work: Work) {
    const client = await getApiClient();
    const edits: api.AnyContentEdit[] = [];
    let id;
    if (work.id) {
        id = work.id.split("/").pop() as string;
    } else {
        throw Error("ID is absent.");
    }

    const result = await findOrCreateEntry(id, schema.venue, work);
    edits.concat(result.edits);
    const neolaceId = result.neolaceId;
    const isNewEntry = result.isNewEntry;

    const addPropertyForVenue = addPropertyValueEdit(neolaceId);

    edits.concat(addPropertyForVenue(schema.doi, work.doi));

    const { id: draftId } = await client.createDraft({
        title: "import concept",
        description: "",
        edits,
      });
      await client.acceptDraft(draftId);
}