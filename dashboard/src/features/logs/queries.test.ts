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
                    username: "Alice",
                    channel_id: null,
                    message_id: null,
                    rule_type: "BAD_WORD",
                    trigger_content: "spam",
                    original_content: null,
                    actions_taken: [],
                    created_at: new Date("2026-01-01T00:00:00.000Z"),
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

        it("should default missing username to empty string", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "2",
                        guild_id: "guild_123",
                        user_id: "user_9",
                        channel_id: null,
                        message_id: null,
                        rule_type: "SPAM",
                        trigger_content: null,
                        original_content: null,
                        actions_taken: [],
                        created_at: new Date("2026-01-01T00:00:00.000Z"),
                    },
                ],
            });

            const result = await getAutomodLogs("guild_123");

            expect(result[0].username).toBe("");
        });

        it("should pass cursors and limit through", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            const cursor = new Date("2026-01-01T00:00:00.000Z");
            await getAutomodLogs("guild_123", 5, cursor, "99");

            const [, params = []] = mockQuery.mock.calls[0];
            expect(params[1]).toEqual(cursor);
            expect(params[2]).toBe("99");
            expect(params[3]).toBe(5);
        });

        it("should reject an empty guild id", async () => {
            await expect(getAutomodLogs("")).rejects.toThrow();
            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should query automod logs scoped to the guild in newest first order", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await getAutomodLogs("guild_123");

            const sql = mockQuery.mock.calls[0][0];
            expect(sql).toContain("FROM automod_logs");
            expect(sql).toContain("WHERE a.guild_id = $1");
            expect(sql).toContain("ORDER BY a.created_at DESC, a.id DESC");
            expect(sql).toContain("LIMIT $4");
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

        it("should pass a LEAVE filter through", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await getJoinLeaveLogs("guild_123", "LEAVE");

            const [, params = []] = mockQuery.mock.calls[0];
            expect(params[1]).toBe("LEAVE");
        });

        it("should reject an invalid action without querying", async () => {
            await expect(getJoinLeaveLogs("guild_123", "KICK")).rejects.toThrow();
            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should return created_at as a native Date so it can be used as a cursor", async () => {
            const testDate = new Date("2026-10-05T00:47:09.591Z");
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "10",
                        user_id: "user_1",
                        username: "Alice",
                        guild_id: "guild_123",
                        action: "JOIN",
                        created_at: testDate,
                    },
                ],
            });

            const result = await getJoinLeaveLogs("guild_123");

            expect(result[0].created_at).toBeInstanceOf(Date);
            expect(result[0].created_at.toISOString()).toBe("2026-10-05T00:47:09.591Z");
        });

        it("should reject an invalid Date input", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "10",
                        user_id: "user_1",
                        username: "Alice",
                        guild_id: "guild_123",
                        action: "JOIN",
                        created_at: new Date("not-a-valid-date"),
                    },
                ],
            });

            await expect(getJoinLeaveLogs("guild_123")).rejects.toThrow();
        });

        it("should pass the cursor through for the next page", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            const cursor = new Date("2026-10-05T00:47:09.591Z");
            await getJoinLeaveLogs("guild_123", null, 20, cursor, "10");

            const [, params = []] = mockQuery.mock.calls[0];
            expect(params[2]).toEqual(cursor);
            expect(params[3]).toBe("10");
        });

        it("should query join leave logs scoped to the guild in newest first order", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await getJoinLeaveLogs("guild_123");

            const sql = mockQuery.mock.calls[0][0];
            expect(sql).toContain("FROM join_leave_logs");
            expect(sql).toContain("WHERE j.guild_id = $1");
            expect(sql).toContain("ORDER BY j.created_at DESC, j.id DESC");
            expect(sql).toContain("LIMIT $5");
        });
    });

    describe("getModerationLogs", () => {
        it("should format PgInterval duration into a human string", async () => {
            const testDate = new Date("2026-01-01T00:00:00.000Z");
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        case_id: "1",
                        guild_id: "guild_123",
                        target_id: "user_2",
                        target_username: "Bob",
                        moderator_id: "user_1",
                        moderator_username: "Alice",
                        action_type: "BAN",
                        reason: "Spam",
                        duration: { years: 1, months: 2, days: 3, hours: 4, minutes: 5, seconds: 6 },
                        created_at: testDate,
                    },
                ],
            });

            const result = await getModerationLogs("guild_123");

            expect(result).toEqual([
                {
                    case_id: "1",
                    guild_id: "guild_123",
                    target_id: "user_2",
                    target_username: "Bob",
                    moderator_id: "user_1",
                    moderator_username: "Alice",
                    action_type: "BAN",
                    reason: "Spam",
                    duration: "1y 2mo 3d 4h 5m 6s",
                    created_at: testDate,
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
                        created_at: new Date("2026-01-01T00:00:00.000Z"),
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
                        created_at: new Date("2026-01-01T00:00:00.000Z"),
                    },
                ],
            });

            const result = await getModerationLogs("guild_123");

            expect(result[0].duration).toBe("2h");
        });

        it("should map an empty interval to null", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        case_id: "4",
                        guild_id: "guild_123",
                        target_id: null,
                        moderator_id: "user_1",
                        action_type: "MUTE",
                        reason: null,
                        duration: {},
                        created_at: new Date("2026-01-01T00:00:00.000Z"),
                    },
                ],
            });

            const result = await getModerationLogs("guild_123");

            expect(result[0].duration).toBeNull();
        });

        it("should map an all zero interval to null", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        case_id: "5",
                        guild_id: "guild_123",
                        target_id: null,
                        moderator_id: "user_1",
                        action_type: "MUTE",
                        reason: null,
                        duration: { years: 0, months: 0, days: 0, hours: 0, minutes: 0, seconds: 0 },
                        created_at: new Date("2026-01-01T00:00:00.000Z"),
                    },
                ],
            });

            const result = await getModerationLogs("guild_123");

            expect(result[0].duration).toBeNull();
        });

        it("should format each interval unit on its own", async () => {
            const cases: { duration: Record<string, number>; expected: string }[] = [
                { duration: { years: 1 }, expected: "1y" },
                { duration: { months: 2 }, expected: "2mo" },
                { duration: { days: 3 }, expected: "3d" },
                { duration: { hours: 4 }, expected: "4h" },
                { duration: { minutes: 5 }, expected: "5m" },
                { duration: { seconds: 6 }, expected: "6s" },
            ];

            for (const { duration, expected } of cases) {
                mockQuery.mockResolvedValue({
                    rows: [
                        {
                            case_id: "6",
                            guild_id: "guild_123",
                            target_id: null,
                            moderator_id: "user_1",
                            action_type: "MUTE",
                            reason: null,
                            duration,
                            created_at: new Date("2026-01-01T00:00:00.000Z"),
                        },
                    ],
                });

                const result = await getModerationLogs("guild_123");

                expect(result[0].duration).toBe(expected);
            }
        });

        it("should omit each zero unit while keeping the rest", async () => {
            const cases: { duration: Record<string, number>; expected: string }[] = [
                { duration: { years: 0, months: 1 }, expected: "1mo" },
                { duration: { months: 0, days: 1 }, expected: "1d" },
                { duration: { days: 0, hours: 1 }, expected: "1h" },
                { duration: { hours: 0, minutes: 1 }, expected: "1m" },
                { duration: { minutes: 0, seconds: 1 }, expected: "1s" },
                { duration: { seconds: 0, years: 1 }, expected: "1y" },
            ];

            for (const { duration, expected } of cases) {
                mockQuery.mockResolvedValue({
                    rows: [
                        {
                            case_id: "7",
                            guild_id: "guild_123",
                            target_id: null,
                            moderator_id: "user_1",
                            action_type: "MUTE",
                            reason: null,
                            duration,
                            created_at: new Date("2026-01-01T00:00:00.000Z"),
                        },
                    ],
                });

                const result = await getModerationLogs("guild_123");

                expect(result[0].duration).toBe(expected);
            }
        });

        it("should query moderation logs scoped to the guild in newest first order", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await getModerationLogs("guild_123");

            const sql = mockQuery.mock.calls[0][0];
            expect(sql).toContain("FROM moderation_logs");
            expect(sql).toContain("WHERE m.guild_id = $1");
            expect(sql).toContain("ORDER BY m.created_at DESC, m.case_id DESC");
            expect(sql).toContain("LIMIT $4");
        });

        it("should pass the case id as the cursor id", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            const cursor = new Date("2026-01-01T00:00:00.000Z");
            await getModerationLogs("guild_123", 10, cursor, "5");

            const [, params = []] = mockQuery.mock.calls[0];
            expect(params[1]).toEqual(cursor);
            expect(params[2]).toBe("5");
            expect(params[3]).toBe(10);
        });
    });
});
