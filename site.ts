/**
 * Home page text and other data for the OpenAlex sample content
 */
import { dedent } from "neolace/lib/dedent.ts";
import { UpdateSite } from "neolace/core/Site.ts";

export const siteData: Partial<Parameters<typeof UpdateSite>[0]> = {
    homePageMD: dedent`
        This is an example of using OpenAlex data, e.g. see ["Computer Science" (concept)](/entry/C41008148)
    `,
    footerMD: dedent`
        **About OpenAlex**: Learn more at [OpenAlex.org](https://openalex.org/)

        **Platform**: Powered by [Neolace](https://www.neolace.com/).
    `,
    frontendConfig: {
        headerLinks: [
            {text: "Home", href: "/"},
        ],
        integrations: {
            plausibleAnalytics: {enabled: false},
        },
        features: {
            hoverPreview: {enabled: true},
        },
    },
};
