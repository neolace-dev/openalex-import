export const schema = {
    // Entry Types:
    concept: "concept",
    institution: "institution",
    author: "author",
    venue: "venue",
    // Properties:
    wikidata: "wikidata-id",
    level: "level",
    works_count: "works-count",
    mag_id: "mag-id",
    wikipedia_id: "wikipedia-id",
    updated_date: "updated-date",
    cited_by_count: "cited-by-count",
    scopus_id: "scopus-id",
    orcid: "orcid",
    ror: "ror-id",
    country_code: "country-code",
    institution_type: "institution-type",
    issn_l: "issn-l",
    issn: "issn",
    // counts_by_year: not yet supported, but should be automatically computable in the future.
    works_api_url: "works-api-url",
    doi: "doi",
    title: "title",
    publication_year: "publication-year",
    publication_date: "publication-date",
    pmid: "pmid",
    pmcid: "pmc-id",
    is_oa: "is-open-access",
    oa_status: "oa-status",
    oa_url: "oa-url",
    is_retracted: "is-retracted",
    is_paratext: "is-paratext",
    // Relationship properties:
    // ancestors: ?,
    // descendants: ?,
    // author: ?,
    last_known_institution: "last-known-institution",
    associated_author: "associated-authors",
    host_venue: "host-venue",
    parent_concept: "parent-concept",
    //child_concepts: don't use - automatically computed
    related_concepts: "related-concepts",
    parent_institutions: "parent-institutions",
    //child_institutions: don't use - automatically computed
    related_institutions: "related-institutions",
};