import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    getAutomodBreakdown,
    getMemberFlow,
    getModerationActivity,
    pivotModerationRows,
    seriesForAction,
} from "./charts";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>()
);

vi.mock("@/lib/db", () => ({
    db: { query: mockQuery },
}));

describe("overview charts (unit)", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("seriesForAction", () => {
        it.each([
            ["BAN", "bans"],
            ["ban", "bans"],
            ["SOFTBAN", "bans"],
            ["softban", "bans"],
            ["KICK", "kicks"],
            ["kick", "kicks"],
            ["MUTE", "mutes"],
            ["mute", "mutes"],
            ["WARN", "warns"],
            ["warn", "warns"],
            ["UNBAN", "other"],
            ["GLOBAL_LOCK", "other"],
            ["UNKNOWN_ACTION", "other"],
            ["", "other"],
        ] as const)("maps %s to %s (case-insensitive)", (action, series) => {
            expect(seriesForAction(action)).toBe(series);
        });
    });

    describe("pivotModerationRows", () => {
        it("returns an empty array when given an empty list", () => {
            expect(pivotModerationRows([])).toEqual([]);
        });

        it("folds action rows into one point per day and sums duplicate types", () => {
            const points = pivotModerationRows([
                { day: "2026-10-01", action_type: "BAN", count: 2 },
                { day: "2026-10-01", action_type: "SOFTBAN", count: 1 }, // also maps to 'bans'
                { day: "2026-10-01", action_type: "UNLOCK", count: 4 },  // maps to 'other'
                { day: "2026-10-02", action_type: "WARN", count: 3 },
                { day: "2026-10-02", action_type: "MUTE", count: 1 },
                { day: "2026-10-03", action_type: null, count: 0 },
            ]);

            expect(points).toEqual([
                { day: "2026-10-01", bans: 3, kicks: 0, mutes: 0, warns: 0, other: 4 },
                { day: "2026-10-02", bans: 0, kicks: 0, mutes: 1, warns: 3, other: 0 },
                { day: "2026-10-03", bans: 0, kicks: 0, mutes: 0, warns: 0, other: 0 },
            ]);
        });

        it("preserves order of first encountered days", () => {
            const points = pivotModerationRows([
                { day: "2026-10-01", action_type: "BAN", count: 1 },
                { day: "2026-10-02", action_type: "BAN", count: 1 },
            ]);
            expect(points.map((p) => p.day)).toEqual(["2026-10-01", "2026-10-02"]);
        });
    });

    describe("getMemberFlow", () => {
        it("queries database with correct parameters and coerces row fields", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    { day: "2026-10-01", joins: "5", leaves: "2" },
                    { day: "2026-10-02", joins: 0, leaves: 0 },
                ],
            });

            const result = await getMemberFlow("guild_123", 14);

            expect(mockQuery).toHaveBeenCalledTimes(1);
            expect(mockQuery.mock.calls[0]?.[1]).toEqual(["guild_123", 14]);
            expect(result).toEqual([
                { day: "2026-10-01", joins: 5, leaves: 2 },
                { day: "2026-10-02", joins: 0, leaves: 0 },
            ]);
        });

        it("returns an empty list when row validation fails", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ day: "invalid-date", joins: "invalid", leaves: 0 }],
            });

            expect(await getMemberFlow("guild_123", 30)).toEqual([]);
        });

        it("handles query rejection gracefully", async () => {
            mockQuery.mockRejectedValue(new Error("Database connection lost"));

            expect(await getMemberFlow("guild_123", 30)).toEqual([]);
        });
    });

    describe("getModerationActivity", () => {
        it("queries database with correct parameters and pivots the rows", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    { day: "2026-10-01", action_type: "KICK", count: "2" },
                    { day: "2026-10-01", action_type: "MUTE", count: "1" },
                    { day: "2026-10-02", action_type: null, count: "0" },
                ],
            });

            const result = await getModerationActivity("guild_123", 7);

            expect(mockQuery).toHaveBeenCalledTimes(1);
            expect(mockQuery.mock.calls[0]?.[1]).toEqual(["guild_123", 7]);
            expect(result).toEqual([
                { day: "2026-10-01", bans: 0, kicks: 2, mutes: 1, warns: 0, other: 0 },
                { day: "2026-10-02", bans: 0, kicks: 0, mutes: 0, warns: 0, other: 0 },
            ]);
        });

        it("returns an empty list when row schema parsing fails", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ day: "2026-10-01", action_type: 12345, count: "not-a-number" }],
            });

            expect(await getModerationActivity("guild_123", 7)).toEqual([]);
        });

        it("returns an empty list when the query fails", async () => {
            mockQuery.mockRejectedValue(new Error("Query timeout"));

            expect(await getModerationActivity("guild_123", 7)).toEqual([]);
        });
    });

    describe("getAutomodBreakdown", () => {
        it("uses default limit of 8 when limit parameter is omitted", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await getAutomodBreakdown("guild_123", 30);

            expect(mockQuery.mock.calls[0]?.[1]).toEqual(["guild_123", 30, 8]);
        });

        it("passes explicit limit and renames rule_type to rule", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    { rule_type: "Spam", count: "15" },
                    { rule_type: "Invites", count: "4" },
                ],
            });

            const result = await getAutomodBreakdown("guild_123", 14, 5);

            expect(mockQuery.mock.calls[0]?.[1]).toEqual(["guild_123", 14, 5]);
            expect(result).toEqual([
                { rule: "Spam", count: 15 },
                { rule: "Invites", count: 4 },
            ]);
        });

        it("returns an empty list when row schema parsing fails", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ rule_type: null, count: "invalid-count" }],
            });

            expect(await getAutomodBreakdown("guild_123", 30)).toEqual([]);
        });

        it("handles query rejection gracefully", async () => {
            mockQuery.mockRejectedValue(new Error("Fatal DB Error"));

            expect(await getAutomodBreakdown("guild_123", 30)).toEqual([]);
        });
    });
});