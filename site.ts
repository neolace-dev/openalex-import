/**
 * Home page text and other data for the OpenAlex sample content
 */
import { dedent } from "neolace/lib/dedent.ts";
import { UpdateSite } from "neolace/core/Site.ts";

export const siteData: Partial<Parameters<typeof UpdateSite>[0]> = {
    homePageContent: dedent`
        # OpenAlex Demo

        This is a [Neolace](https://www.neolace.com) demo, with data from [OpenAlex](https://docs.openalex.org/):

        > OpenAlex is a fully open catalog of the global research system. It's named after the [ancient Library of Alexandria](https://en.wikipedia.org/wiki/Library_of_Alexandria)
        and made by the nonprofit [OurResearch](https://ourresearch.org/).

        We use the OpenAlex data to test how well Neolace can handle such a huge dataset. However, since we are a startup and don't have any funding for this, we cannot afford to run this site with the entire OpenAlex dataset, although we may test with the entire dataset from time to time.

        ## Available content

        "The OpenAlex dataset describes scholarly entities and how those entities are connected to each other." There are five types of entities in the dataset:

        * { entryType("work") } - { entryType("work").description }
          * This demo has [{ allEntries().filter(entryType=entryType("work")).count() } works](/lookup?e=allEntries().filter(entryType%3DentryType("work"))) from the total set of ~239 million works.
        * { entryType("author") } - { entryType("author").description }
          * This demo has [{ allEntries().filter(entryType=entryType("author")).count() } authors](/lookup?e=allEntries().filter(entryType%3DentryType("author"))) from the total set of ~213 million authors.
        * { entryType("venue") } - { entryType("venue").description }
          * All [{ allEntries().filter(entryType=entryType("venue")).count() } venues](/lookup?e=allEntries().filter(entryType%3DentryType("venue"))) are available in this demo.
        * { entryType("institution") } - { entryType("institution").description }
          * All [{ allEntries().filter(entryType=entryType("institution")).count() } institutions](/lookup?e=allEntries().filter(entryType%3DentryType("institution"))) are available in this demo.
        * { entryType("concept") } - { entryType("concept").description }
          * All [{ allEntries().filter(entryType=entryType("concept")).count() } concepts](/lookup?e=allEntries().filter(entryType%3DentryType("concept"))) are available in this demo.

        ## Explore

        Here is a graph of concepts related to { entry("C172790937") }.

        { entry("C172790937").andAncestors().graph() }

        Here are some institutions related to { entry("I114027177") }. Use the first toolbar button to expand the view:

        { entry("I114027177").andRelated(depth=2).graph() }
    `,
    footerContent: dedent`
        **About OpenAlex**: Learn more at [OpenAlex.org](https://openalex.org/).

        **License**: OpenAlex data is made available under the [CC0 license](https://creativecommons.org/publicdomain/zero/1.0/). That means it's in the public domain, and free to use in any way you like.

        **Platform**: Powered by [Neolace](https://www.neolace.com/).
    `,
    frontendConfig: {
        headerLinks: [
            { text: "Home", href: "/" },
        ],
        integrations: {
            plausibleAnalytics: { enabled: false },
        },
        features: {
            hoverPreview: { enabled: true },
        },
        plugins: {
            // Search indexing is currently too slow to support the use of TypeSense search on the huge OpenAlex data sets.
            // search: {},
        },
    },
};
