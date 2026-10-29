import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getTelemetry } from "./telemetry";

interface MockResponse {
    ok: boolean;
    json: () => Promise<unknown>;
}

const mockBackendFetch = vi.hoisted(() =>
    vi.fn<(url: string, init?: RequestInit) => Promise<MockResponse>>()
);

vi.mock("@/lib/backend", () => ({
    backendFetch: mockBackendFetch,
}));

describe("getTelemetry", () => {
    const validTelemetry = {
        database: { healthy: true, latency_ms: 0.25 },
        redis: { healthy: true, latency_ms: 0.15 },
        memory: { bot_mb: 50.5, ml_mb: 800.2 },
        shard: { shard_id: 0, total_shards: 1, gateway_latency_ms: 120 },
    };

    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("fetches the exact telemetry endpoint with a 2000ms AbortSignal and returns parsed data", async () => {
        const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

        mockBackendFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(validTelemetry),
        });

        const result = await getTelemetry();

        expect(result).toEqual(validTelemetry);

        expect(mockBackendFetch).toHaveBeenCalledTimes(1);
        expect(mockBackendFetch.mock.calls[0]?.[0]).toBe("/api/telemetry");

        expect(timeoutSpy).toHaveBeenCalledWith(2000);
        const passedSignal = mockBackendFetch.mock.calls[0]?.[1]?.signal;
        expect(passedSignal).toBeInstanceOf(AbortSignal);
    });

    it("returns null and skips JSON parsing when response.ok is false", async () => {
        const mockJson = vi.fn<() => Promise<unknown>>().mockResolvedValue({});

        mockBackendFetch.mockResolvedValueOnce({
            ok: false,
            json: mockJson,
        });

        const result = await getTelemetry();

        expect(result).toBeNull();
        expect(mockJson).not.toHaveBeenCalled();
    });

    it("returns null and logs error when response fails schema validation", async () => {
        const invalidData = { database: "not-an-object", random: 123 };

        mockBackendFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.resolve(invalidData),
        });

        const result = await getTelemetry();

        expect(result).toBeNull();
    });

    it("returns null when backendFetch rejects (e.g. network error / timeout)", async () => {
        mockBackendFetch.mockRejectedValueOnce(new Error("TimeoutError: The operation was aborted"));

        const result = await getTelemetry();

        expect(result).toBeNull();
    });

    it("returns null when response.json() rejects (e.g. invalid JSON syntax)", async () => {
        mockBackendFetch.mockResolvedValueOnce({
            ok: true,
            json: () => Promise.reject(new SyntaxError("Unexpected token in JSON")),
        });

        const result = await getTelemetry();

        expect(result).toBeNull();
    });
});