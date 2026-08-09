import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    searchWarns,
    getWarnThresholds,
    saveWarnThresholds,
    deleteWarnThresholds,
} from "./queries";
import type { SaveWarnThresholdInput } from "./types";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>()
);

const mockConnect = vi.hoisted(() =>
    vi.fn<() => Promise<{
        query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>;
        release: () => void;
    }>>()
);

const mockDel = vi.hoisted(() => vi.fn<() => Promise<number>>());

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
        connect: mockConnect,
    },
}));

vi.mock("@/lib/redis", () => ({
    default: {
        del: mockDel,
    },
}));

describe("Warns Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("searchWarns", () => {
        it("should return parsed warns", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "warn_1",
                        user_id: "user_1",
                        guild_id: "guild_123",
                        moderator_id: "user_2",
                        reason: "Spam",
                        created_at: "2026-01-01T00:00:00.000Z",
                        is_active: true,
                    },
                ],
            });

            const result = await searchWarns("guild_123", "user_1");

            expect(result[0].id).toBe("warn_1");
            expect(result[0].created_at).toBe("2026-01-01T00:00:00.000Z");
            const params = mockQuery.mock.calls[0][1];
            expect(params).toEqual(["guild_123", "user_1"]);
        });
    });

    describe("getWarnThresholds", () => {
        it("should return parsed thresholds", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "1",
                        guild_id: "guild_123",
                        warn_count: 3,
                        action_type: ["KICK"],
                        roles_to_add: [],
                        roles_to_remove: [],
                        duration: null,
                    },
                ],
            });

            const result = await getWarnThresholds("guild_123");

            expect(result[0].id).toBe(1);
            expect(result[0].warn_count).toBe(3);
        });

        it("should return an empty array when the query throws", async () => {
            mockQuery.mockRejectedValue(new Error("db down"));

            const result = await getWarnThresholds("guild_123");

            expect(result).toEqual([]);
        });

        it("should return parsed thresholds and pass correct query parameters", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "1",
                        guild_id: "guild_123",
                        warn_count: 3,
                        action_type: ["KICK"],
                        roles_to_add: [],
                        roles_to_remove: [],
                        duration: null,
                    },
                ],
            });

            const result = await getWarnThresholds("guild_123");

            expect(result[0].id).toBe(1);
            expect(result[0].warn_count).toBe(3);
            expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["guild_123"]);
        });
    });

    describe("saveWarnThresholds", () => {
        it("should delete all thresholds when the list is empty", async () => {
            const client = {
                query: vi.fn<() => Promise<{ rows?: unknown[] }>>(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);

            await saveWarnThresholds("guild_123", []);

            expect(client.query).toHaveBeenCalledWith("BEGIN");
            expect(client.query).toHaveBeenCalledWith(
                "DELETE FROM warn_thresholds WHERE guild_id = $1",
                ["guild_123"]
            );
            expect(client.query).toHaveBeenCalledWith("COMMIT");
            expect(client.release).toHaveBeenCalled();
            expect(mockDel).toHaveBeenCalledWith("warn_thresholds:guild_123");
        });

        it("should upsert thresholds within a transaction", async () => {
            const client = {
                query: vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);

            const thresholds: SaveWarnThresholdInput[] = [
                {
                    warnCount: 3,
                    actionType: ["KICK"],
                    rolesToAdd: [],
                    rolesToRemove: [],
                    duration: null,
                },
            ];

            await saveWarnThresholds("guild_123", thresholds);

            expect(client.query.mock.calls[1][0]).toContain("INSERT INTO warn_thresholds");
            expect(client.query.mock.calls[2][0]).toContain("DELETE");
            expect(client.query).toHaveBeenCalledWith("COMMIT");
            expect(mockDel).toHaveBeenCalledWith("warn_thresholds:guild_123");
        });

        it("should roll back and release when the query throws", async () => {
            const client = {
                query: vi.fn<() => Promise<{ rows?: unknown[] }>>(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            client.query.mockRejectedValue(new Error("constraint violation"));

            await expect(saveWarnThresholds("guild_123", [])).rejects.toThrow(
                "constraint violation"
            );

            expect(client.query).toHaveBeenCalledWith("ROLLBACK");
            expect(client.release).toHaveBeenCalled();
        });

        it("should upsert multiple thresholds with correct placeholder offsets and params", async () => {
            const client = {
                query: vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);

            const thresholds: SaveWarnThresholdInput[] = [
                {
                    warnCount: 3,
                    actionType: ["KICK"],
                    rolesToAdd: ["role_1"],
                    rolesToRemove: undefined,
                    duration: null,
                },
                {
                    warnCount: 5,
                    actionType: ["BAN"],
                    rolesToAdd: undefined,
                    rolesToRemove: ["role_2"],
                    duration: "7d",
                },
            ];

            await saveWarnThresholds("guild_123", thresholds);

            const upsertSql = client.query.mock.calls[1][0];
            expect(upsertSql).toContain("($1, $2, $3, $4, $5, $6), ($7, $8, $9, $10, $11, $12)");

            const upsertParams = client.query.mock.calls[1][1];
            expect(upsertParams).toEqual([
                "guild_123", 3, ["KICK"], ["role_1"], null, null,
                "guild_123", 5, ["BAN"], null, ["role_2"], "7d",
            ]);

            const deleteParams = client.query.mock.calls[2][1];
            expect(deleteParams).toEqual(["guild_123", [3, 5]]);

            expect(client.query).toHaveBeenCalledWith("COMMIT");
            expect(mockDel).toHaveBeenCalledWith("warn_thresholds:guild_123");
        });
    });

    describe("deleteWarnThresholds", () => {
        it("should do nothing for an empty id list", async () => {
            await deleteWarnThresholds("guild_123", []);

            expect(mockQuery).not.toHaveBeenCalled();
            expect(mockDel).not.toHaveBeenCalled();
        });

        it("should delete the thresholds and clear the cache", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await deleteWarnThresholds("guild_123", [1, 2]);

            const params = mockQuery.mock.calls[0][1];
            expect(params).toEqual(["guild_123", [1, 2]]);
            expect(mockDel).toHaveBeenCalledWith("warn_thresholds:guild_123");
        });
    });
});
