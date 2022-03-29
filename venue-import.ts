import { api, getApiClient, VNID } from "./neolace-api-client.ts";
import { Institution, InstitutionType, DehydratedInstitution } from "./institutions-import.ts"
import { DehydratedAuthor } from "./authors-import.ts"
import { addPropertyValueEdit, schema, updateRelatinoships } from "./openalex-import.ts"
type NominalType<T, K extends string> = T & { nominal: K };
type VNID = NominalType<string, "VNID">;

export interface DehydratedVenue {
    "id"?: string; // null value is known issue for alternate host venues in authors
    "issn_l": string;
    "issn": string[];
    "display_name": string;
    "publisher": string;
}

// export interface HostVenue extends DehydratedVenue {

// }