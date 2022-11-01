import { api, getApiClient, VNID } from "./neolace-api-client.ts";
import { Institution, InstitutionType, DehydratedInstitution } from "./institutions-import.ts"
import { DehydratedAuthor } from "./authors-import.ts"
import { addPropertyValueEdit, schema, updateRelatinoships, findOrCreateEntry } from "./openalex-import.ts"
type NominalType<T, K extends string> = T & { nominal: K };
type VNID = NominalType<string, "VNID">;

export interface DehydratedVenue {
    "id"?: string; // null value is known issue for alternate host venues in authors
    "issn_l": string;
    "issn": string[];
    "display_name": string;
    "publisher": string;
}

export interface Venue extends DehydratedVenue {
    "works_count": number;
    "cited_by_count": number;
    // "is_oa": boolean;
    // "is_in_doaj": boolean;
    // "homepage_url": string;
    "ids": {
        "openalex": string;
        "issn_l": string;
        "mag"?: string;
        "issn": string[];
    };
    "counts_by_year": string;
    "works_api_url"?: string;
    "updated_date"?: string;
    "created_date"?: string; // to add
}

export async function importVanueToDatabase(venue: Venue) {
    const client = await getApiClient();
    const edits: api.AnyContentEdit[] = [];
    let id;
    if (venue.id) {
        id = venue.id.split("/").pop() as string;
    } else {
        throw Error("ID is absent.");
    }

    const result = await findOrCreateEntry(id, schema.venue, venue);
    edits.concat(result.edits);
    const neolaceId = result.neolaceId;

    const addPropertyForVenue = addPropertyValueEdit(neolaceId);

    edits.concat(addPropertyForVenue(schema.works_count, venue.works_count));
    edits.concat(addPropertyForVenue(schema.cited_by_count, venue.cited_by_count));
    edits.concat(addPropertyForVenue(schema.issn_l, venue.issn_l));
    for (const i in venue.issn) {
        edits.concat(addPropertyForVenue(schema.issn, i));
    }
    edits.concat(addPropertyForVenue(schema.mag_id, venue.ids.mag));
    edits.concat(addPropertyForVenue(schema.counts_by_year, venue.counts_by_year));
    edits.concat(addPropertyForVenue(schema.works_api_url, venue.works_api_url));
    edits.concat(addPropertyForVenue(schema.updated_date, venue.updated_date));

    const { id: draftId } = await client.createDraft({
        title: "import concept",
        description: "",
        edits,
      });
      await client.acceptDraft(draftId);
}