export const config = {
    /**
     * Server-side base URL for the Rust backend (server components, actions,
     * queries). Inside Docker this points at the in-network service name.
     */
    backendInternalUrl:
        process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8080",
    /**
     * Browser-safe base URL for the Rust backend, e.g. WebSocket music control.
     * `NEXT_PUBLIC_*` vars are inlined into the client bundle at build time,
     * so changing this requires a rebuild.
     */
    publicBackendUrl:
        process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8080",
}
