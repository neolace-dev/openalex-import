#!/usr/bin/env deno run --import-map=import_map.json --allow-net --allow-read --allow-env --unstable --no-check
/**
 * Create OpenAlex demo site, which is accessible at
 * http://openalex.local.neolace.net:5555/
 */
import * as log from "std/log/mod.ts";
import { EmptyResultError, VNID } from "neolace/deps/vertex-framework.ts";

import { graph } from "neolace/core/graph.ts";
import { CreateUser, User } from "neolace/core/User.ts";
import { CreateSite, Site, UpdateSite } from "neolace/core/Site.ts";
import { siteData } from "./site.ts";

// Now create the OpenAlex example content too:

log.info("Checking users and site...");

// Create "Braden" for initial content, if it doesn't already exist
const {id: _bradenId} = await graph.pullOne(User, u => u.id, {key: "user-braden"}).catch(err => {
    if (!(err instanceof EmptyResultError)) { throw err; }
    return graph.runAsSystem(CreateUser({
        email: "braden@neolace.com",
        username: "braden",
        fullName: "Braden MacDonald",
    }));
});

// Create the "OpenAlex" site:
const {id: siteId} = await graph.pullOne(Site, s => s.id, {key: "site-openalex"}).catch(err =>{
    if (!(err instanceof EmptyResultError)) { throw err; }
    return graph.runAs(_bradenId, CreateSite({
        id: VNID("_siteOPENALEX"),
        name: "OpenAlex",
        domain: "openalex.local.neolace.net",
        slugId: `site-openalex`,
        siteCode: "OPENA",
        adminUser: _bradenId,
    }));
});

await graph.runAsSystem(UpdateSite({key: siteId, ...siteData}));