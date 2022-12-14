import { api } from "./neolace-api-client.ts";
import { DehydratedInstitution } from "./institutions-import.ts";
import { DehydratedAuthor } from "./authors-import.ts";
import { DehydratedVenue } from "./venue-import.ts";
import { DehydratedConcept } from "./concept-import.ts";
import {
    getIdFromUrl,
    setBooleanProperty,
    setDateProperty,
    setIntegerProperty,
    setStringProperty,
} from "./utils.ts";
import { schema } from "./schema.ts";

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
}

interface OpenAccess {
    "is_oa": boolean;
    "oa_status": "gold" | "green" | "hybrid" | "bronze" | "closed";
    "oa_url"?: string;
}

export interface Work {
    "id": string;
    "doi": string; //d
    "title": string; // not needed
    "display_name": string; // d
    "publication_year": number; // d
    "publication_date": string; // d
    "ids": { // d
        "openalex": string;
        "doi": string;
        "mag"?: string;
        "pmid"?: string;
        "pmcid"?: string;
    };
    "host_venue": HostVenue; // rel
    "type": string; // TODO add Crossref's controlled vocabulary // TODO add to schema
    "open_access": OpenAccess; // d
    "authorships": Authorship[]; // ??? rel
    "cited_by_count": number; // d
    "biblio": { // TODO to add to schema
        "volume"?: string;
        "issue"?: string;
        "first_page"?: string;
        "last_page"?: string;
    };
    "is_retracted": boolean; // d
    "is_paratext": boolean; // d
    "concepts": (DehydratedConcept & { // rels
        "score": number;
    })[];
    "mesh"?: { // NOTE Mesh object from PubMed //TODO add to schema
        "descriptor_ui"?: string;
        "descriptor_name"?: string;
        "qualifier_ui"?: string;
        "qualifier_name"?: string;
        "is_major_topic"?: boolean;
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

export function importWork(work: Work): api.AnyBulkEdit[] {
    const entryKey = getIdFromUrl(work.id);
    const entryTypeKey = schema.work;

    // Generate the "bulk edits" to create/update this concept:
    const edits: api.AnyBulkEdit[] = [
        {
            code: "UpsertEntryByKey",
            data: {
                where: { entryKey, entryTypeKey },
                set: {
                    name: work.display_name ?? "Unknown Work",
                },
            },
        },
        {
            code: "SetPropertyFacts",
            data: {
                entryWith: { entryKey },
                set: [
                    setStringProperty(schema.doi, work.doi),
                    setIntegerProperty(schema.publication_year, work.publication_year),
                    setDateProperty(schema.publication_date, work.publication_date),
                    // Ids
                    setIntegerProperty(schema.mag_id, work.ids.mag ? parseInt(work.ids.mag, 10) : undefined),
                    setStringProperty(schema.pmid, work.ids.pmid),
                    setStringProperty(schema.pmcid, work.ids.pmcid),
                    // open access
                    setBooleanProperty(schema.is_oa, work.open_access.is_oa),
                    setStringProperty(schema.oa_status, work.open_access.oa_status),
                    setStringProperty(schema.oa_url, work.open_access.oa_url),

                    setIntegerProperty(schema.cited_by_count, work.cited_by_count),
                    setBooleanProperty(schema.is_retracted, work.is_retracted),
                    setBooleanProperty(schema.is_paratext, work.is_paratext),

                    //  set the updated date
                    setDateProperty(schema.updated_date, work.updated_date),
                ],
            },
        },
    ];

    if (work.host_venue) {
        const venueKey = getIdFromUrl(work.host_venue.id);
        edits.push({
            code: "UpsertEntryByKey",
            data: {
                where: { entryTypeKey: schema.venue, entryKey: venueKey },
                setOnCreate: { name: work.host_venue.display_name },
            },
        });
        edits.push(
            {
                code: "UpsertEntryByKey",
                data: {
                    where: { entryTypeKey: schema.host_venue, entryKey: `${entryKey}-h` },
                    setOnCreate: { name: work.host_venue.display_name },
                },
            },
            {
                code: "SetPropertyFacts",
                data: {
                    entryWith: { entryKey: `${entryKey}-h` },
                    set: [
                        setStringProperty(schema.url, work.host_venue.url),
                    ],
                },
            },
        );
        edits.push({
            code: "SetRelationships",
            data: {
                entryWith: { entryKey },
                set: [
                    {
                        propertyKey: schema.has_host_venue,
                        toEntries: [{ entryWith: { entryKey: `${entryKey}-h` } }],
                    },
                ],
            },
        });
    }

    return edits;
}
