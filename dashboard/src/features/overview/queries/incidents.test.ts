import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { describeRaidEvent, getRecentIncidents } from "./incidents";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>()
);

vi.mock("@/lib/db", () => ({
    db: { query: mockQuery },
}));

const ALERT = [
    "# Raid detected! Statistics",
    "- Current joins in the past minute: 42",
    "- Average joins per minute: 1.5",
    "- Standard deviation per minute: 0.8",
    "- Calculated threshold: 5",
    "Triggered by user `spammer`.",
].join("\n");

describe("describeRaidEvent", () => {
    it("reads the join count from an automatic trigger", () => {
        expect(describeRaidEvent("TRIGGERED", { message: ALERT })).toEqual({
            title: "Raid detected",
            details: "42 joins in the last minute exceeded the threshold",
            actor: "Anti-Raid Guard",
        });
    });

    it("falls back when the alert message has no join count", () => {
        expect(describeRaidEvent("TRIGGERED", { message: "something else" }).details)
            .toBe("Join rate exceeded the threshold");
        expect(describeRaidEvent("TRIGGERED", null).details)
            .toBe("Join rate exceeded the threshold");
    });

    it("credits the moderator on a manual trigger", () => {
        expect(describeRaidEvent("TRIGGERED", { moderator: "oud", manual: true })).toEqual({
            title: "Raid mode started",
            details: "Started manually by @oud",
            actor: "oud",
        });
    });

    it("handles a manual trigger without a moderator name", () => {
        expect(describeRaidEvent("TRIGGERED", { manual: true })).toEqual({
            title: "Raid mode started",
            details: "Started manually",
            actor: "Anti-Raid Guard",
        });
    });

    it("describes a resolve as an end, not a new raid", () => {
        expect(describeRaidEvent("RESOLVED", null)).toEqual({
            title: "Raid resolved",
            details: "Raid mode ended",
            actor: "Anti-Raid Guard",
        });
    });

    it("labels an applied mitigation", () => {
        expect(describeRaidEvent("ACTION_APPLIED", null)).toEqual({
            title: "Raid mitigation applied",
            details: "A mitigation action ran",
            actor: "Anti-Raid Guard",
        });
    });

    it("ignores details of the wrong shape", () => {
        expect(describeRaidEvent("TRIGGERED", { manual: "yes", message: 7 }).title)
            .toBe("Raid detected");
    });

    it("passes an unknown event type through", () => {
        expect(describeRaidEvent("SOMETHING_NEW", null)).toEqual({
            title: "Anti-Raid event",
            details: "SOMETHING_NEW",
            actor: "Anti-Raid Guard",
        });
    });
});

describe("getRecentIncidents (Unit)", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("maps moderation logs and handles reason/name fallbacks", async () => {
        const date1 = new Date("2026-10-01T10:00:00Z");
        const date2 = new Date("2026-10-01T09:00:00Z");

        mockQuery
            .mockResolvedValueOnce({
                rows: [
                    {
                        case_id: "101",
                        action_type: "BAN",
                        reason: "Violated server rules",
                        target_id: "201",
                        target_name: "RuleBreaker",
                        moderator_id: "301",
                        moderator_name: "ModOud",
                        created_at: date1,
                    },
                    {
                        case_id: "102",
                        action_type: "WARN",
                        reason: "   ", // whitespace reason fallback
                        target_id: "202",
                        target_name: "202", // fallback when username is null
                        moderator_id: "302",
                        moderator_name: "302",
                        created_at: date2,
                    },
                ],
            })
            .mockResolvedValueOnce({ rows: [] }) // automod
            .mockResolvedValueOnce({ rows: [] }) // raid
            .mockResolvedValueOnce({ rows: [] }); // ticket

        const items = await getRecentIncidents("guild_123", 5);

        expect(items).toEqual([
            {
                id: "mod-101",
                kind: "MODERATION",
                title: "Moderation BAN",
                details: "Violated server rules",
                actor: "ModOud",
                target: "RuleBreaker",
                createdAt: date1,
                href: "/dashboard/guild_123/logs",
            },
            {
                id: "mod-102",
                kind: "MODERATION",
                title: "Moderation WARN",
                details: "No reason specified",
                actor: "302",
                target: "202",
                createdAt: date2,
                href: "/dashboard/guild_123/logs",
            },
        ]);
    });

    it("maps automod logs and prioritizes trigger_content with 40-character truncation", async () => {
        const date = new Date("2026-10-01T12:00:00Z");
        const longTrigger = "a".repeat(60);
        const longOriginal = "b".repeat(60);

        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: "1",
                        rule_type: "BAD_WORDS",
                        trigger_content: longTrigger,
                        original_content: longOriginal,
                        user_id: "501",
                        username: "Spammer",
                        created_at: date,
                    },
                    {
                        id: "2",
                        rule_type: "INVITES",
                        trigger_content: null,
                        original_content: longOriginal,
                        user_id: "502",
                        username: "502",
                        created_at: date,
                    },
                    {
                        id: "3",
                        rule_type: "SPAM",
                        trigger_content: null,
                        original_content: "   ",
                        user_id: "503",
                        username: "503",
                        created_at: date,
                    },
                ],
            })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] });

        const items = await getRecentIncidents("guild_123", 5);

        expect(items[0]?.details).toBe(`Trigger: "${"a".repeat(40)}"`);
        expect(items[1]?.details).toBe("b".repeat(40));
        expect(items[2]?.details).toBe("Rule violation caught");
        expect(items[0]?.actor).toBe("AutoMod");
        expect(items[0]?.target).toBe("Spammer");
    });

    it("maps ticket and raid events correctly", async () => {
        const dateRaid = new Date("2026-10-01T15:00:00Z");
        const dateTicket = new Date("2026-10-01T14:00:00Z");

        mockQuery
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({ rows: [] })
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: "88",
                        event_type: "RESOLVED",
                        details: null,
                        created_at: dateRaid,
                    },
                ],
            })
            .mockResolvedValueOnce({
                rows: [
                    {
                        id: "99",
                        opener_id: "777",
                        opener_name: "TicketOpener",
                        status: "OPEN",
                        created_at: dateTicket,
                    },
                ],
            });

        const items = await getRecentIncidents("guild_123", 5);

        expect(items).toEqual([
            {
                id: "raid-88",
                kind: "RAID",
                title: "Raid resolved",
                details: "Raid mode ended",
                actor: "Anti-Raid Guard",
                target: null,
                createdAt: dateRaid,
                href: "/dashboard/guild_123/anti-raid",
            },
            {
                id: "ticket-99",
                kind: "TICKET",
                title: "Support Ticket #99",
                details: "Status: OPEN",
                actor: "TicketOpener",
                target: null,
                createdAt: dateTicket,
                href: "/dashboard/guild_123/tickets",
            },
        ]);
    });

    it("interleaves all sources in descending order and truncates to limit", async () => {
        const t1 = new Date("2026-10-01T10:00:00Z");
        const t2 = new Date("2026-10-01T11:00:00Z");
        const t3 = new Date("2026-10-01T12:00:00Z");
        const t4 = new Date("2026-10-01T13:00:00Z");

        mockQuery
            .mockResolvedValueOnce({
                rows: [{ case_id: "1", action_type: "KICK", reason: "r", target_id: "1", target_name: "u", moderator_id: "2", moderator_name: "m", created_at: t1 }],
            })
            .mockResolvedValueOnce({
                rows: [{ id: "2", rule_type: "SPAM", trigger_content: "x", original_content: null, user_id: "3", username: "u3", created_at: t4 }],
            })
            .mockResolvedValueOnce({
                rows: [{ id: "3", event_type: "ACTION_APPLIED", details: null, created_at: t2 }],
            })
            .mockResolvedValueOnce({
                rows: [{ id: "4", opener_id: "5", opener_name: "u5", status: "CLOSED", created_at: t3 }],
            });

        // Request limit of 3 out of 4 total events
        const items = await getRecentIncidents("guild_123", 3);

        expect(items).toHaveLength(3);
        expect(items.map((i) => i.id)).toEqual(["auto-2", "ticket-4", "raid-3"]);
    });

    it("returns empty array and logs error when a query rejects", async () => {
        const dbError = new Error("Connection failed");
        mockQuery.mockRejectedValue(dbError);

        const items = await getRecentIncidents("guild_123");

        expect(items).toEqual([]);
    });
});