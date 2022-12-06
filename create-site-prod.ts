/**
 * Create OpenAlex demo site, which is accessible at
 * https://openalex.neolace.com/
 */
import { EmptyResultError } from "neolace/deps/vertex-framework.ts";

import { getGraph } from "neolace/core/graph.ts";
import { HumanUser } from "neolace/core/User.ts";
import { CreateSite, Site, UpdateSite } from "neolace/core/Site.ts";

const graph = await getGraph();

// Create "Braden" for initial content, if it doesn't already exist
const { id: bradenUserId } = await graph.pullOne(HumanUser, (u) => u.id, { with: { email: "braden@neolace.com" } });

// Create the "OpenAlex" site:
const { id: siteId } = await graph.pullOne(Site, (s) => s.id, { with: { key: "openalex" } }).catch((err) => {
    if (!(err instanceof EmptyResultError)) throw err;
    return graph.runAsSystem(CreateSite({
        key: "openalex",
        name: "OpenAlex",
        domain: "openalex.neolace.com",
        adminUser: bradenUserId,
    }));
});

await graph.runAsSystem(UpdateSite({ id: siteId, ...siteData }));
 