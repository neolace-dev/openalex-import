/** Check the state of a promise */
export function promiseState(
    promise: Promise<unknown>,
): Promise<{ status: "fulfilled" | "rejected" | "pending"; value?: unknown; reason?: unknown }> {
    const pendingState = { status: "pending" as const };

    return Promise.race([promise, pendingState]).then(
        (value) => value === pendingState ? pendingState : { status: "fulfilled" as const, value },
        (reason) => ({ status: "rejected" as const, reason }),
    );
}

export function exists(path: string) {
    try {
        Deno.statSync(path);
        return true;
    } catch {
        return false;
    }
}

/** Given a URL like "https://openalex.org/C2778407487", return the ID like "C2778407487" */
export const getIdFromUrl = (url: string) => url.split("/").pop()!;
export const getIdFromUrlIfSet = (url: string | undefined) => url ? url.split("/").pop()! : url;
export const getWikipediaIdFromUrl = (url: string | undefined) =>
    url ? url.split("/").pop()!.replaceAll("%20", "_") : undefined;

export const setStringProperty = (propertyKey: string, value: string | undefined) => ({
    propertyKey,
    facts: value === undefined ? [] : [{ valueExpression: `"${value}"` }],
});

export const setBooleanProperty = (propertyKey: string, value: boolean | undefined) => ({
    propertyKey,
    facts: value === undefined ? [] : [{ valueExpression: `${value ? "true" : "false"}`}],
});

export const setStringListProperty = (propertyKey: string, value: string[] | undefined) => ({
    propertyKey,
    facts: Array.isArray(value) ? value.map((v) => ({ valueExpression: `"${v}"` })) : [],
});

export const setIntegerProperty = (propertyKey: string, value: number | undefined) => ({
    propertyKey,
    facts: value === undefined ? [] : [{ valueExpression: value.toString() }],
});

export const setDateProperty = (propertyKey: string, value: string | undefined) => ({
    propertyKey,
    // Note: some "updated_date" are actually updated_datetime values like "2022-10-09T09:37:13.298106"
    // but since we don't support datetimes yet, we strip off the time information.
    facts: value === undefined ? [] : [{ valueExpression: `date("${value.substring(0, 10)}")` }],
});
