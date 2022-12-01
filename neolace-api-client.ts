////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
// Get the API client

import * as api from "neolace/deps/neolace-api.ts";

export { api };

export const VNID = api.VNID;

let _apiClientPromise: Promise<api.NeolaceApiClient> | undefined = undefined;

// deno-lint-ignore require-await
export async function getApiClient(): Promise<api.NeolaceApiClient> {
    if (_apiClientPromise !== undefined) {
        return _apiClientPromise;
    }
    return _apiClientPromise = (async () => {
        const apiEndpoint = Deno.env.get("NEOLACE_API_ENDPOINT") ?? "http://local.neolace.net:5554";
        if (!apiEndpoint.startsWith("http")) {
            console.error("You must set NEOLACE_API_ENDPOINT to a valid http:// or https:// URL for the Neolace realm.");
            Deno.exit(1);
        }
        const apiKey = Deno.env.get("NEOLACE_API_KEY") ?? "SYS_KEY_INSECURE_DEV_KEY";

        const client = new api.NeolaceApiClient({
            basePath: apiEndpoint,
            fetchApi: fetch,
            authToken: apiKey,
            siteKey: 'openalex',
        });

        try {
            await client.checkHealth();
        } catch (err) {
            if (err instanceof api.NotAuthenticated) {
                console.error(`unable to authenticate with Neolace API server ${apiEndpoint}. Check your API key.`);
                Deno.exit(1);
            } else {
                console.error(`Neolace API server ${apiEndpoint} is not accessible or not healthy.`);
                throw err;
            }
        }
        return client;
    })();
}
