import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ATTENTION_WINDOW_HOURS, buildAttentionItems, getAttentionItems } from "./attention";
import { RawAttentionCounts } from "../types";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>()
);

vi.mock("@/lib/db", () => ({
    db: { query: mockQuery },
}));

// Windowing and guild scoping are covered in attention.integration.test.ts.

const NOW = Date.UTC(2026, 9, 29, 12, 0, 0);
const HOUR = 3_600_000;

const EMPTY: RawAttentionCounts = {
    open_tickets: 0,
    oldest_open_ticket_at: null,
    giveaways_ending: 0,
    next_giveaway_end_at: null,
    temp_bans_expiring: 0,
    next_unban_at: null,
    failing_reminders: 0,
};

describe("buildAttentionItems", () => {
    it("returns nothing when every count is zero", () => {
        expect(buildAttentionItems(EMPTY, "g1", NOW)).toEqual([]);
    });

    it("builds every category in a fixed order with links into the guild", () => {
        const items = buildAttentionItems(
            {
                open_tickets: 3,
                oldest_open_ticket_at: new Date(NOW - 2 * 24 * HOUR),
                giveaways_ending: 1,
                next_giveaway_end_at: new Date(NOW + 3 * HOUR),
                temp_bans_expiring: 2,
                next_unban_at: new Date(NOW + 5 * HOUR),
                failing_reminders: 1,
            },
            "g1",
            NOW
        );

        expect(items).toEqual([
            {
                kind: "OPEN_TICKETS",
                title: "3 open tickets",
                detail: "Oldest opened 2d ago",
                href: "/dashboard/g1/tickets",
            },
            {
                kind: "GIVEAWAYS_ENDING",
                title: "1 giveaway ending soon",
                detail: "Next ends in 3h",
                href: "/dashboard/g1/giveaways",
            },
            {
                kind: "TEMP_BANS_EXPIRING",
                title: "2 temp bans expiring soon",
                detail: "Next unban in 5h",
                href: "/dashboard/g1/logs",
            },
            {
                kind: "FAILING_REMINDERS",
                title: "1 reminder failing to send",
                detail: "Check the channel exists and the bot can post there",
                href: "/dashboard/g1/reminders",
            },
        ]);
    });

    it("falls back to generic detail when the timestamp is missing", () => {
        const items = buildAttentionItems(
            { ...EMPTY, open_tickets: 1, giveaways_ending: 1, temp_bans_expiring: 1 },
            "g1",
            NOW
        );

        expect(items.map((i) => i.detail)).toEqual([
            "Waiting for staff",
            `Within ${ATTENTION_WINDOW_HOURS.toString()}h`,
            `Within ${ATTENTION_WINDOW_HOURS.toString()}h`,
        ]);
    });

    it("skips zero categories", () => {
        const items = buildAttentionItems({ ...EMPTY, failing_reminders: 4 }, "g1", NOW);

        expect(items.map((i) => i.kind)).toEqual(["FAILING_REMINDERS"]);
        expect(items[0]?.title).toBe("4 reminders failing to send");
    });
});

describe("getAttentionItems", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("coerces string counts and null timestamps from the row", async () => {
        mockQuery.mockResolvedValue({
            rows: [{
                open_tickets: "2",
                oldest_open_ticket_at: null,
                giveaways_ending: "0",
                next_giveaway_end_at: null,
                temp_bans_expiring: "0",
                next_unban_at: null,
                failing_reminders: "0",
            }],
        });

        expect(await getAttentionItems("g1")).toEqual([
            {
                kind: "OPEN_TICKETS",
                title: "2 open tickets",
                detail: "Waiting for staff",
                href: "/dashboard/g1/tickets",
            },
        ]);
        expect(mockQuery.mock.calls[0]?.[1]).toEqual(["g1", ATTENTION_WINDOW_HOURS]);
    });

    it("returns an empty list when the row fails validation", async () => {
        mockQuery.mockResolvedValue({ rows: [{ ...EMPTY, next_unban_at: "not a date" }] });

        expect(await getAttentionItems("g1")).toEqual([]);
        expect(console.error).toHaveBeenCalled();
    });

    it("returns an empty list when the query fails", async () => {
        mockQuery.mockRejectedValue(new Error("connection refused"));

        expect(await getAttentionItems("g1")).toEqual([]);
        expect(console.error).toHaveBeenCalled();
    });
});
