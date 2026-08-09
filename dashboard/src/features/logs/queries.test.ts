import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getAutomodLogs, getJoinLeaveLogs, getModerationLogs } from "./queries";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>()
);

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
    },
}));

describe("Logs Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getAutomodLogs", () => {
        it("should pass defaults to the query when no cursor is provided", async () => {
            const rows = [
                {
                    id: "1",
                    guild_id: "guild_123",
                    user_id: "user_1",
                    channel_id: null,
                    message_id: null,
                    rule_type: "BAD_WORD",
                    trigger_content: "spam",
                    original_content: null,
                    actions_taken: [],
                    created_at: "2026-01-01T00:00:00.000Z",
                },
            ];
            mockQuery.mockResolvedValue({ rows });

            const result = await getAutomodLogs("guild_123");

            expect(result).toEqual(rows);
            const [, params = []] = mockQuery.mock.calls[0];
            expect(params[0]).toBe("guild_123");
            expect(params[1]).toBeNull();
            expect(params[2]).toBeNull();
            expect(params[3]).toBe(20);
        });

        it("should pass cursors and limit through", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await getAutomodLogs(
                "guild_123",
                5,
                "2026-01-01T00:00:00.000Z",
                "99"
            );

            const [, params = []] = mockQuery.mock.calls[0];
            expect(params[1]).toBe("2026-01-01T00:00:00.000Z");
            expect(params[2]).toBe("99");
            expect(params[3]).toBe(5);
        });

        it("should reject an empty guild id", async () => {
            await expect(getAutomodLogs("")).rejects.toThrow();
            expect(mockQuery).not.toHaveBeenCalled();
        });
    });

    describe("getJoinLeaveLogs", () => {
        it("should return empty when the db returns no rows", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            const result = await getJoinLeaveLogs("guild_123");

            expect(result).toEqual([]);
            const [, params = []] = mockQuery.mock.calls[0];
            expect(params[0]).toBe("guild_123");
            expect(params[1]).toBeNull();
            expect(params[2]).toBeNull();
            expect(params[3]).toBeNull();
            expect(params[4]).toBe(20);
        });

        it("should pass an action filter through", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await getJoinLeaveLogs("guild_123", "JOIN", 10);

            const [, params = []] = mockQuery.mock.calls[0];
            expect(params[1]).toBe("JOIN");
            expect(params[4]).toBe(10);
        });

    });

    describe("getModerationLogs", () => {
        it("should format PgInterval duration into a human string", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        case_id: "1",
                        guild_id: "guild_123",
                        target_id: "user_2",
                        moderator_id: "user_1",
                        action_type: "BAN",
                        reason: "Spam",
                        duration: { years: 1, months: 2, days: 3, hours: 4, minutes: 5, seconds: 6 },
                        created_at: new Date("2026-01-01T00:00:00.000Z"),
                    },
                ],
            });

            const result = await getModerationLogs("guild_123");

            expect(result).toEqual([
                {
                    case_id: "1",
                    guild_id: "guild_123",
                    target_id: "user_2",
                    moderator_id: "user_1",
                    action_type: "BAN",
                    reason: "Spam",
                    duration: "1y 2mo 3d 4h 5m 6s",
                    created_at: "2026-01-01T00:00:00.000Z",
                },
            ]);
        });

        it("should map a null duration to null", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        case_id: "2",
                        guild_id: "guild_123",
                        target_id: null,
                        moderator_id: "user_1",
                        action_type: "WARN",
                        reason: null,
                        duration: null,
                        created_at: "2026-01-01T00:00:00.000Z",
                    },
                ],
            });

            const result = await getModerationLogs("guild_123");

            expect(result[0].duration).toBeNull();
        });

        it("should ignore zero-value duration fields", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        case_id: "3",
                        guild_id: "guild_123",
                        target_id: null,
                        moderator_id: "user_1",
                        action_type: "MUTE",
                        reason: null,
                        duration: { days: 0, hours: 2 },
                        created_at: "2026-01-01T00:00:00.000Z",
                    },
                ],
            });

            const result = await getModerationLogs("guild_123");

            expect(result[0].duration).toBe("2h");
        });

        it("should pass the case id as the cursor id", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await getModerationLogs("guild_123", 10, "2026-01-01T00:00:00.000Z", "5");

            const [, params = []] = mockQuery.mock.calls[0];
            expect(params[2]).toBe("5");
        });
    });
});
