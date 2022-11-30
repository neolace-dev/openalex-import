import { api } from "./neolace-api-client.ts";
import { schema } from "./schema.ts";
import { getIdFromUrl, setDateProperty, setIntegerProperty, setStringProperty } from "./utils.ts";

export interface DehydratedVenue {
    "id"?: string; // null value is known issue for alternate host venues in authors
    "issn_l": string;
    "issn": string[];
    "display_name": string;
    "publisher": string;
}

export interface Venue extends DehydratedVenue {
    "id": string;
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

const entryTypeKey = schema.venue;

export function importVenue(venue: Venue): api.AnyBulkEdit[] {
    const entryKey = getIdFromUrl(venue.id);
    const edits: api.AnyBulkEdit[] = [
        {
            code: "UpsertEntryByKey",
            data: {
                where: { entryKey, entryTypeKey },
                set: { name: venue.display_name },
            },
        },
        {
            code: "SetPropertyFacts",
            data: { entryWith: { entryKey }, set: [
                setStringProperty(schema.issn_l, venue.issn_l),
                setIntegerProperty(schema.works_count, venue.works_count),
                setIntegerProperty(schema.cited_by_count, venue.cited_by_count),
                {
                    propertyKey: schema.issn,
                    facts: venue.issn.map(value => ({ valueExpression: `"${value}"` })),
                },
                // Counts by year would require creating a separate VenueCountsByYear Entry Type
                setIntegerProperty(schema.mag_id, venue.ids.mag ? parseInt(venue.ids.mag, 10) : undefined),
                setStringProperty(schema.works_api_url, venue.works_api_url),
                setDateProperty(schema.updated_date, venue.updated_date),
            ] },
        },
    ];

    return edits;
}
