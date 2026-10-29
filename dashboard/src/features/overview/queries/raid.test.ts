import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getActiveRaid } from "./raid";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>()
);

vi.mock("@/lib/db", () => ({
    db: { query: mockQuery },
}));

// Guild scoping against real rows is covered in raid.integration.test.ts.

describe("getActiveRaid", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("returns null when no raid is active", async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        expect(await getActiveRaid("guild_123")).toBeNull();
        expect(mockQuery.mock.calls[0]?.[1]).toEqual(["guild_123"]);
    });

    it("returns the start time of an active raid", async () => {
        const startedAt = new Date("2026-10-29T10:00:00.000Z");
        mockQuery.mockResolvedValue({ rows: [{ raid_start_time: startedAt }] });

        expect(await getActiveRaid("guild_123")).toEqual({ startedAt });
    });

    it("coerces a string timestamp into a Date", async () => {
        mockQuery.mockResolvedValue({ rows: [{ raid_start_time: "2026-10-29T10:00:00.000Z" }] });

        const raid = await getActiveRaid("guild_123");
        expect(raid?.startedAt).toBeInstanceOf(Date);
        expect(raid?.startedAt.toISOString()).toBe("2026-10-29T10:00:00.000Z");
    });

    it("returns null when the row fails validation", async () => {
        mockQuery.mockResolvedValue({ rows: [{ raid_start_time: "not a date" }] });

        expect(await getActiveRaid("guild_123")).toBeNull();
        expect(console.error).toHaveBeenCalled();
    });

    it("returns null when the query fails", async () => {
        mockQuery.mockRejectedValue(new Error("connection refused"));

        expect(await getActiveRaid("guild_123")).toBeNull();
        expect(console.error).toHaveBeenCalled();
    });
});
