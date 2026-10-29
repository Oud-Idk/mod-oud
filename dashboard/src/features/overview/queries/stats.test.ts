import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { buildStatCards, formatDelta, getWeeklyStats } from "./stats";
import { RawWeeklyStats } from "../types";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>()
);

vi.mock("@/lib/db", () => ({
    db: { query: mockQuery },
}));

// Windowing and guild scoping are covered in stats.integration.test.ts.

const ZERO: RawWeeklyStats = {
    joins_current: 0,
    joins_previous: 0,
    leaves_current: 0,
    leaves_previous: 0,
    moderation_current: 0,
    moderation_previous: 0,
    automod_current: 0,
    automod_previous: 0,
    tickets_current: 0,
    tickets_previous: 0,
};

describe("formatDelta", () => {
    it.each([
        [5, 5, "No change vs prior 7d"],
        [8, 5, "+3 vs prior 7d"],
        [2, 5, "-3 vs prior 7d"],
        [0, 0, "No change vs prior 7d"],
        [1500, 0, "+1,500 vs prior 7d"],
    ])("formats %d against %d as %s", (current, previous, expected) => {
        expect(formatDelta(current, previous)).toBe(expected);
    });
});

describe("buildStatCards", () => {
    it("builds the four cards in a fixed order", () => {
        const cards = buildStatCards({
            ...ZERO,
            joins_current: 10,
            leaves_current: 4,
            joins_previous: 3,
            leaves_previous: 1,
            moderation_current: 7,
            moderation_previous: 9,
            automod_current: 12,
            automod_previous: 12,
            tickets_current: 2,
        });

        expect(cards).toEqual([
            { id: "member_growth", title: "Net Member Growth", value: "+6", delta: "+4 vs prior 7d" },
            { id: "moderation", title: "Moderation Actions", value: "7", delta: "-2 vs prior 7d" },
            { id: "automod", title: "AutoMod Triggers", value: "12", delta: "No change vs prior 7d" },
            { id: "tickets", title: "Tickets Opened", value: "2", delta: "+2 vs prior 7d" },
        ]);
    });

    it("shows a net member loss without a plus sign", () => {
        const [growth] = buildStatCards({ ...ZERO, joins_current: 1, leaves_current: 5 });

        expect(growth.value).toBe("-4");
    });

    it("shows zero growth as a bare zero", () => {
        expect(buildStatCards(ZERO)[0]?.value).toBe("0");
    });
});

describe("getWeeklyStats", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("coerces string counts and passes the window", async () => {
        mockQuery.mockResolvedValue({ rows: [{ ...ZERO, moderation_current: "3" }] });

        const cards = await getWeeklyStats("g1");

        expect(cards?.find((c) => c.id === "moderation")?.value).toBe("3");
        expect(mockQuery.mock.calls[0]?.[1]).toEqual(["g1", 7]);
    });

    it("returns null when the row fails validation", async () => {
        mockQuery.mockResolvedValue({ rows: [] });

        expect(await getWeeklyStats("g1")).toBeNull();
    });

    it("returns null when the query fails", async () => {
        mockQuery.mockRejectedValue(new Error("connection refused"));

        expect(await getWeeklyStats("g1")).toBeNull();
    });
});
