import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getActiveRaid } from "./raid";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>()
);

vi.mock("@/lib/db", () => ({
    db: { query: mockQuery },
}));

describe("getActiveRaid (Unit)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns null when no raid row exists", async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        const result = await getActiveRaid("guild_123");

        expect(result).toBeNull();
        expect(mockQuery).toHaveBeenCalledTimes(1);
        expect(mockQuery.mock.calls[0]?.[1]).toEqual(["guild_123"]);
    });

    it("returns the startedAt Date object when active", async () => {
        const startedAt = new Date("2026-10-29T10:00:00.000Z");
        mockQuery.mockResolvedValue({ rows: [{ raid_start_time: startedAt }] });

        const result = await getActiveRaid("guild_123");

        expect(result).toEqual({ startedAt });
    });

    it("coerces ISO string timestamp into a Date object", async () => {
        mockQuery.mockResolvedValue({
            rows: [{ raid_start_time: "2026-10-29T10:00:00.000Z" }],
        });

        const result = await getActiveRaid("guild_123");

        expect(result).not.toBeNull();
        expect(result?.startedAt).toBeInstanceOf(Date);
        expect(result?.startedAt.toISOString()).toBe("2026-10-29T10:00:00.000Z");
    });

    it("returns null and logs validation error when row format is invalid", async () => {
        mockQuery.mockResolvedValue({ rows: [{ raid_start_time: "invalid-date-string" }] });

        const result = await getActiveRaid("guild_123");

        expect(result).toBeNull();
    });

    it("returns null and logs error when query rejects", async () => {
        const dbError = new Error("connection refused");
        mockQuery.mockRejectedValue(dbError);

        const result = await getActiveRaid("guild_123");

        expect(result).toBeNull();
    });
});