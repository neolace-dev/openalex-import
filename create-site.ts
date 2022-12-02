#!/usr/bin/env deno run --allow-net --allow-read --allow-env --no-check
/**
 * Create OpenAlex demo site, which is accessible at
 * http://openalex.local.neolace.net:5555/
 */
import * as log from "std/log/mod.ts";
import { EmptyResultError } from "neolace/deps/vertex-framework.ts";

import { getGraph } from "neolace/core/graph.ts";
import { User } from "neolace/core/User.ts";
import { CreateSite, Site, UpdateSite } from "neolace/core/Site.ts";
import { siteData } from "./site.ts";
import { shutdown } from "neolace/app/shutdown.ts";

const graph = await getGraph();

// Now create the OpenAlex example content too:

log.info("Checking users and site...");

// Create "Braden" for initial content, if it doesn't already exist
const { id: adminUserId } = await graph.pullOne(User, (u) => u.id, { with: { username: "admin" } });

// Create the "OpenAlex" site:
const { id: siteId } = await graph.pullOne(Site, (s) => s.id, { with: { key: "openalex" } }).catch((err) => {
    if (!(err instanceof EmptyResultError)) throw err;
    return graph.runAsSystem(CreateSite({
        key: "openalex",
        name: "OpenAlex",
        domain: "openalex.local.neolace.net",
        adminUser: adminUserId,
    }));
});

await graph.runAsSystem(UpdateSite({ id: siteId, ...siteData }));
await shutdown();
