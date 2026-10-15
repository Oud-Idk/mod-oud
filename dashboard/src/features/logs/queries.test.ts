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

// Row mapping, SQL shape, tenant scoping, ordering and cursors live in
// queries.integration.test.ts against a real database. What stays here is the
// behaviour a real database will not produce on demand: input validation that
// skips the query, a schema rejection and a failing connection.

describe("Logs Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getAutomodLogs", () => {
        it("should reject an empty guild id", async () => {
            await expect(getAutomodLogs("")).rejects.toThrow();
            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getAutomodLogs("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("getJoinLeaveLogs", () => {
        it("should reject an empty guild id", async () => {
            await expect(getJoinLeaveLogs("")).rejects.toThrow();
            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should reject an invalid action without querying", async () => {
            // @ts-expect-error KICK is not in "JOIN" | "LEAVE"
            await expect(getJoinLeaveLogs("guild_123", "KICK")).rejects.toThrow();
            expect(mockQuery).not.toHaveBeenCalled();
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

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getJoinLeaveLogs("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("getModerationLogs", () => {
        it("should reject an empty guild id", async () => {
            await expect(getModerationLogs("")).rejects.toThrow();
            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getModerationLogs("guild_123")).rejects.toThrow("connection lost");
        });

        // Postgres drops zero interval components, so pg never yields an
        // explicit zero. Zero-unit coverage lives here instead of the db suite.
        it("should treat zero-valued date units as absent", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        case_id: "1",
                        guild_id: "guild_123",
                        target_id: "user_1",
                        target_username: "Target",
                        moderator_id: "mod_1",
                        moderator_username: "Mod",
                        action_type: "BAN",
                        reason: "Spam",
                        duration: { years: 0, months: 0, days: 0, hours: 1 },
                        created_at: new Date("2026-01-02T00:00:00.000Z"),
                    },
                ],
            });

            const [log] = await getModerationLogs("guild_123");

            expect(log.duration).toBe("1h");
        });

        it("should treat zero-valued time units as absent", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        case_id: "1",
                        guild_id: "guild_123",
                        target_id: "user_1",
                        target_username: "Target",
                        moderator_id: "mod_1",
                        moderator_username: "Mod",
                        action_type: "BAN",
                        reason: "Spam",
                        duration: { days: 1, hours: 0, minutes: 0, seconds: 0 },
                        created_at: new Date("2026-01-02T00:00:00.000Z"),
                    },
                ],
            });

            const [log] = await getModerationLogs("guild_123");

            expect(log.duration).toBe("1d");
        });
    });
});
