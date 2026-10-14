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

            await expect(saveWarnThresholds("guild_123", [])).rejects.toThrow("constraint violation");

            expect(client.query).toHaveBeenCalledWith("ROLLBACK");
            expect(client.release).toHaveBeenCalled();
        });
    });

    describe("deleteWarnThresholds", () => {
        it("should do nothing for an empty id list", async () => {
            await deleteWarnThresholds("guild_123", []);

            expect(mockQuery).not.toHaveBeenCalled();
            expect(mockDel).not.toHaveBeenCalled();
        });
    });
});