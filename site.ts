/**
 * Home page text and other data for the TechNotes sample content
 */
import { dedent } from "neolace/lib/dedent.ts";
import { UpdateSite } from "neolace/core/Site.ts";

export const siteData: Partial<Parameters<typeof UpdateSite>[0]> = {
    homePageMD: dedent`
        This is what it is.
    `,
    footerMD: dedent`
        **Footer here**
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
