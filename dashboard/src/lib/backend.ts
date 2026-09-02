import { config } from "@/config";

/**
 * Server-only helper for dashboard -> Rust backend calls.
 * Injects `Authorization: Bearer INTERNAL_API_SECRET` for static routes.
 * Use only in server actions / server components (never in "use client").
 */
export async function backendFetch(
    path: string,
    init: RequestInit = {}
): Promise<Response> {
    const url = path.startsWith("http")
        ? path
        : `${config.backendInternalUrl}${path.startsWith("/") ? "" : "/"}${path}`;

    const headers = new Headers(init.headers);

    if (!headers.has("Content-Type") && init.body !== undefined) {
        headers.set("Content-Type", "application/json");
    }

    if (config.internalApiSecret.length > 0) {
        headers.set("Authorization", `Bearer ${config.internalApiSecret}`);
    }

    return fetch(url, {
        ...init,
        headers,
        cache: "no-store",
    });
}
