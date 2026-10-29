import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getBotProcessStatus } from "./health";

const mockFetch = vi.hoisted(() =>
    vi.fn<(url: string, init?: RequestInit) => Promise<{ ok: boolean }>>()
);

vi.stubGlobal("fetch", mockFetch);

describe("getBotProcessStatus", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("is true when the health endpoint answers ok", async () => {
        mockFetch.mockResolvedValue({ ok: true });

        expect(await getBotProcessStatus()).toBe(true);
        expect(mockFetch.mock.calls[0]?.[0]).toMatch(/\/health$/);
        expect(mockFetch.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
    });

    it("is false on an error status", async () => {
        mockFetch.mockResolvedValue({ ok: false });

        expect(await getBotProcessStatus()).toBe(false);
    });

    it("is false when the request fails or times out", async () => {
        mockFetch.mockRejectedValue(new DOMException("timed out", "TimeoutError"));

        expect(await getBotProcessStatus()).toBe(false);
    });
});
