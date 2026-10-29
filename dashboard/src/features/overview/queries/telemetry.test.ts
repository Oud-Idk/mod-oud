import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

interface MockResponse {
    ok: boolean;
    json(): Promise<unknown>;
}

const mockFetch = vi.hoisted(() =>
    vi.fn<(url: string, init?: RequestInit) => Promise<MockResponse>>()
);

vi.stubGlobal("fetch", mockFetch);

describe("overview telemetry query", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getTelemetry", () => {
        it("should fetch and parse valid telemetry data", async () => {
            const telemetryData = {
                database: { healthy: true, latency_ms: 0.25 },
                redis: { healthy: true, latency_ms: 0.15 },
                memory: { bot_mb: 50.5, ml_mb: 800.2 },
                shard: { shard_id: 0, total_shards: 1, gateway_latency_ms: 120 },
            };

            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(telemetryData),
            });

            const { getTelemetry } = await import("./telemetry");
            const result = await getTelemetry();
            expect(result).toEqual(telemetryData);
        });

        it("should return null if backend fetch fails or response is not ok", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                json: vi.fn<() => Promise<unknown>>().mockResolvedValue({}),
            });

            const { getTelemetry } = await import("./telemetry");
            const result = await getTelemetry();
            expect(result).toBeNull();
        });
    });
});
