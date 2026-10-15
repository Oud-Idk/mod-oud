import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    searchWarns,
    getWarnThresholds,
    saveWarnThresholds,
    deleteWarnThresholds,
} from "./queries";

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

    // Row mapping, SQL shape, tenant scoping and constraints live in
    // queries.integration.test.ts against a real database. What stays here is the
    // behaviour a real database will not produce on demand: a failing
    // connection, the getWarnThresholds error swallow, and the early returns
    // that skip the query.

    describe("searchWarns", () => {
        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(searchWarns("guild_123", "user_1")).rejects.toThrow("connection lost");
        });
    });

    describe("getWarnThresholds", () => {
        it("should return an empty array when the query throws", async () => {
            mockQuery.mockRejectedValue(new Error("db down"));

            const result = await getWarnThresholds("guild_123");

            expect(result).toEqual([]);
        });
    });

    describe("saveWarnThresholds", () => {
        it("should roll back and release when a query throws", async () => {
            const client = {
                query: vi.fn<() => Promise<{ rows?: unknown[] }>>(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            client.query.mockRejectedValue(new Error("constraint violation"));

            await expect(saveWarnThresholds("guild_123", [])).rejects.toThrow(
                new Error("constraint violation")
            );

            expect(client.query).toHaveBeenCalledWith("ROLLBACK");
            expect(client.release).toHaveBeenCalled();
        });

        it("should begin, commit and clear the guild cache on save", async () => {
            const client = {
                query: vi.fn<() => Promise<{ rows?: unknown[] }>>().mockResolvedValue({ rows: [] }),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            mockDel.mockResolvedValue(1);

            await saveWarnThresholds("guild_123", [
                { warnCount: 3, actionType: ["KICK"], rolesToAdd: [], rolesToRemove: [], duration: null },
            ]);

            expect(client.query).toHaveBeenCalledWith("BEGIN");
            expect(client.query).toHaveBeenCalledWith("COMMIT");
            expect(mockDel).toHaveBeenCalledWith("warn_thresholds:guild_123");
            expect(client.release).toHaveBeenCalled();
        });

        it("should clear the guild cache when saving an empty list", async () => {
            const client = {
                query: vi.fn<() => Promise<{ rows?: unknown[] }>>().mockResolvedValue({ rows: [] }),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            mockDel.mockResolvedValue(1);

            await saveWarnThresholds("guild_123", []);

            expect(client.query).toHaveBeenCalledWith("BEGIN");
            expect(client.query).toHaveBeenCalledWith("COMMIT");
            expect(mockDel).toHaveBeenCalledWith("warn_thresholds:guild_123");
            expect(client.release).toHaveBeenCalled();
        });

        it("should still save when the cache clear fails", async () => {
            const client = {
                query: vi.fn<() => Promise<{ rows?: unknown[] }>>().mockResolvedValue({ rows: [] }),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            mockDel.mockRejectedValue(new Error("redis down"));

            await saveWarnThresholds("guild_123", [
                { warnCount: 3, actionType: ["KICK"], rolesToAdd: [], rolesToRemove: [], duration: null },
            ]);

            expect(client.query).toHaveBeenCalledWith("COMMIT");
            expect(client.release).toHaveBeenCalled();
        });
    });

    describe("deleteWarnThresholds", () => {
        it("should do nothing for an empty id list", async () => {
            await deleteWarnThresholds("guild_123", []);

            expect(mockQuery).not.toHaveBeenCalled();
            expect(mockDel).not.toHaveBeenCalled();
        });

        it("should clear the guild cache on delete", async () => {
            mockQuery.mockResolvedValue({ rows: [] });
            mockDel.mockResolvedValue(1);

            await deleteWarnThresholds("guild_123", [1]);

            expect(mockQuery).toHaveBeenCalled();
            expect(mockDel).toHaveBeenCalledWith("warn_thresholds:guild_123");
        });

        it("should still delete when the cache clear fails", async () => {
            mockQuery.mockResolvedValue({ rows: [] });
            mockDel.mockRejectedValue(new Error("redis down"));

            await deleteWarnThresholds("guild_123", [1]);

            expect(mockQuery).toHaveBeenCalled();
        });
    });
});