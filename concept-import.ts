#!/usr/bin/env deno run --import-map=import_map.json --allow-net --allow-read --allow-env --unstable --no-check

import { api, getApiClient, VNID } from "./neolace-api-client.ts";

const client = await getApiClient();
// await client.eraseAllEntriesDangerously({confirm: "danger"});

const count_per_page = 50;
const level = 2;

for (let page = 1; page < (10_000/count_per_page); page++) {
    console.log(`Processing page ${page}.`)
    const raw_data = await fetch(`https://api.openalex.org/concepts?page=${page}&per-page=${count_per_page}&filter=level:${level}`);
    const all_data = await raw_data.json();
    // console.log(all_data.results[0]);
    for (const concept of all_data.results) {
        const id = concept.id.split("/").pop()
        // console.log(id)
        try {
            await client.getEntry(id)
            console.log(`   entry ${id} already exists.`)
            continue

        } catch (error) {
            if (error instanceof api.NotFound) {
                //  this is good we have to create the entry.
            } else {
                throw error;
            }
        }

        //  create a new entry
        const neolaceId = VNID();
        const edits: api.AnyContentEdit[] = [
            {
                code: api.CreateEntry.code,
                data: {
                    id: neolaceId,
                    friendlyId: id,
                    name: concept.display_name,
                    type: VNID("_vj4bFX3CVAGMis4aiL4AJ"),
                    description: concept.description ?? "",
                },
            },
        ];

        //  set the wikidata id
        if (concept.wikidata) {
            edits.push({
                code: "AddPropertyValue",
                data: {
                    property: VNID("_63mbf1PWCiYQVs53ef3lcp"),
                    entry: neolaceId,
                    valueExpression: `"${concept.wikidata.split("/").pop()}"`,
                    propertyFactId: VNID(),
                    note: "",
                }
            })
        }

        //  set the level
        edits.push({
            code: "AddPropertyValue",
            data: {
                property: VNID("_3AyM6hRQL23PhhHZrboCYr"),
                entry: neolaceId,
                valueExpression: `"${concept.level}"`,
                propertyFactId: VNID(),
                note: "",
            }
        })

        //  set the works count
        edits.push({
            code: "AddPropertyValue",
            data: {
                property: VNID("_4OujpOZawdTunrjtSQrPcb"),
                entry: neolaceId,
                valueExpression: `"${concept.works_count}"`,
                propertyFactId: VNID(),
                note: "",
            }
        })

        //  set the microsoft academic graph id
        if (concept.ids.mag) {
            edits.push({
                code: "AddPropertyValue",
                data: {
                    property: VNID("_1i2GXNofq5YEgaA3R9F4KN"),
                    entry: neolaceId,
                    valueExpression: `"${concept.ids.mag}"`,
                    propertyFactId: VNID(),
                    note: "",
                }
            })
        }


        //  set the wikipedia id
        if (concept.ids.wikipedia) {
            edits.push({
                code: "AddPropertyValue",
                data: {
                    property: VNID("_468JDObMgV93qhEfHSAWnr"),
                    entry: neolaceId,
                    valueExpression: `"${concept.ids.wikipedia.split("/").pop().replace("%20", "_")}"`,
                    propertyFactId: VNID(),
                    note: "",
                }
            })
        }

        //  set the updated date
        if (concept.updated_date) {
            edits.push({
                code: "AddPropertyValue",
                data: {
                    property: VNID("_1M7JXgQKUfgSageiKdR82T"),
                    entry: neolaceId,
                    valueExpression: `"${concept.updated_date}"`,
                    propertyFactId: VNID(),
                    note: "",
                }
            })
        }

        // deno-lint-ignore no-explicit-any
        const parents = (concept.ancestors ?? []).filter((a: any) => a.level === concept.level - 1);

        for (const ancestor of parents) {
            const ancestor_id = ancestor.id.split("/").pop();
            const entry_vnid = (await client.getEntry(ancestor_id)).id;

            edits.push({
                code: "AddPropertyValue",
                data: {
                    property: VNID("_1uwLIPU2RI457BkrPs3rgM"),
                    entry: neolaceId,
                    valueExpression: `[[/entry/${entry_vnid}]]`,
                    propertyFactId: VNID(),
                    note: "",
                }
            })
        }



        const { id: draftId } = await client.createDraft({
            title: "import concept",
            description: "",
            edits,
        });
        await client.acceptDraft(draftId);
        
    }

    if (page * count_per_page >= all_data.meta.count) {
        break;
    }
}




