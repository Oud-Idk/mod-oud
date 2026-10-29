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

// SQL shape, zero-filling, windowing and guild scoping are covered in
// charts.integration.test.ts. This file covers the mapping and the failure paths.

describe("overview charts", () => {
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
            ["SOFTBAN", "bans"],
            ["KICK", "kicks"],
            ["MUTE", "mutes"],
            ["WARN", "warns"],
            ["warn", "warns"],
            ["UNBAN", "other"],
            ["GLOBAL_LOCK", "other"],
        ] as const)("maps %s to %s", (action, series) => {
            expect(seriesForAction(action)).toBe(series);
        });
    });

    describe("pivotModerationRows", () => {
        it("folds action rows into one point per day", () => {
            const points = pivotModerationRows([
                { day: "2026-10-01", action_type: "BAN", count: 2 },
                { day: "2026-10-01", action_type: "SOFTBAN", count: 1 },
                { day: "2026-10-01", action_type: "UNLOCK", count: 4 },
                { day: "2026-10-02", action_type: "WARN", count: 3 },
            ]);

            expect(points).toEqual([
                { day: "2026-10-01", bans: 3, kicks: 0, mutes: 0, warns: 0, other: 4 },
                { day: "2026-10-02", bans: 0, kicks: 0, mutes: 0, warns: 3, other: 0 },
            ]);
        });

        it("keeps an empty day as all zeros", () => {
            expect(pivotModerationRows([{ day: "2026-10-01", action_type: null, count: 0 }])).toEqual([
                { day: "2026-10-01", bans: 0, kicks: 0, mutes: 0, warns: 0, other: 0 },
            ]);
        });
    });

    describe("getMemberFlow", () => {
        it("coerces string counts and passes the window", async () => {
            mockQuery.mockResolvedValue({ rows: [{ day: "2026-10-01", joins: "5", leaves: "2" }] });

            expect(await getMemberFlow("guild_123", 30)).toEqual([
                { day: "2026-10-01", joins: 5, leaves: 2 },
            ]);
            expect(mockQuery.mock.calls[0]?.[1]).toEqual(["guild_123", 30]);
        });

        it("returns an empty list when a row fails validation", async () => {
            mockQuery.mockResolvedValue({ rows: [{ day: "not-a-day", joins: "1", leaves: "0" }] });

            expect(await getMemberFlow("guild_123", 30)).toEqual([]);
            expect(console.error).toHaveBeenCalled();
        });

        it("returns an empty list when the query fails", async () => {
            mockQuery.mockRejectedValue(new Error("connection refused"));

            expect(await getMemberFlow("guild_123", 30)).toEqual([]);
            expect(console.error).toHaveBeenCalled();
        });
    });

    describe("getModerationActivity", () => {
        it("pivots the rows it reads", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    { day: "2026-10-01", action_type: "KICK", count: "2" },
                    { day: "2026-10-01", action_type: "MUTE", count: "1" },
                ],
            });

            expect(await getModerationActivity("guild_123", 30)).toEqual([
                { day: "2026-10-01", bans: 0, kicks: 2, mutes: 1, warns: 0, other: 0 },
            ]);
        });

        it("returns an empty list when the query fails", async () => {
            mockQuery.mockRejectedValue(new Error("timeout"));

            expect(await getModerationActivity("guild_123", 30)).toEqual([]);
        });
    });

    describe("getAutomodBreakdown", () => {
        it("maps rule rows and passes the limit", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    { rule_type: "Spam", count: "9" },
                    { rule_type: "Zalgo", count: "1" },
                ],
            });

            expect(await getAutomodBreakdown("guild_123", 30, 5)).toEqual([
                { rule: "Spam", count: 9 },
                { rule: "Zalgo", count: 1 },
            ]);
            expect(mockQuery.mock.calls[0]?.[1]).toEqual(["guild_123", 30, 5]);
        });

        it("returns an empty list when the query fails", async () => {
            mockQuery.mockRejectedValue(new Error("timeout"));

            expect(await getAutomodBreakdown("guild_123", 30)).toEqual([]);
        });
    });
});
