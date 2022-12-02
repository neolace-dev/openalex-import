import { api } from "./neolace-api-client.ts";
import { schema } from "./schema.ts";
import { getIdFromUrl, getIdFromUrlIfSet, setDateProperty, setIntegerProperty, setStringListProperty, setStringProperty } from "./utils.ts";

export interface DehydratedVenue {
    "id"?: string; // null value is known issue for alternate host venues in authors
    "issn_l": string|null;
    "issn": string[]|null;
    "display_name": string;
    "publisher": string;
}

export interface Venue extends DehydratedVenue {
    "id": string;
    "abbreviated_title": string|null;
    "alternate_titles": string[];
    "homepage_url": string|null;
    "works_count": number;
    "cited_by_count": number;
    "is_oa": boolean|null;
    "is_in_doaj": boolean|null;
    // "homepage_url": string;
    "ids": {
        "openalex": string;
        "issn_l"?: string;
        "mag"?: string;
        "issn"?: string[];
        /** e.g. https://fatcat.wiki/container/z3ijzhu7zzey3f7jwws7rzopoq */
        "fatcat"?: string;
        "wikidata"?: string;
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
            data: {
                entryWith: { entryKey },
                set: [
                    setStringProperty(schema.wikidata, getIdFromUrlIfSet(venue.ids.wikidata)),
                    setStringProperty(schema.fatcat_id, getIdFromUrlIfSet(venue.ids.fatcat)),
                    setStringProperty(schema.abbreviated_title, venue.abbreviated_title ?? undefined),
                    setStringListProperty(schema.alternate_titles, venue.alternate_titles),
                    setStringProperty(schema.homepage_url, venue.homepage_url ?? undefined),
                    setStringProperty(schema.issn_l, venue.issn_l ?? undefined),
                    setIntegerProperty(schema.works_count, venue.works_count),
                    setIntegerProperty(schema.cited_by_count, venue.cited_by_count),
                    setStringListProperty(schema.issn, venue.issn ?? undefined),
                    // Counts by year would require creating a separate VenueCountsByYear Entry Type
                    setIntegerProperty(schema.mag_id, venue.ids.mag ? parseInt(venue.ids.mag, 10) : undefined),
                    setStringProperty(schema.works_api_url, venue.works_api_url),
                    setDateProperty(schema.updated_date, venue.updated_date),
                ],
            },
        },
    ];

    return edits;
}
