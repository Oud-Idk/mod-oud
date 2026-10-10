import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { deleteStarboardConfig, upsertStarboardConfig } from "./queries";
import { starboardConfigInputSchema, type SaveableStarboardConfig } from "./types";

// Row mapping, SQL shape and constraint violations live in
// queries.integration.test.ts against a real database. What stays here is the
// behaviour a real database will not produce on demand: a failing connection and
// a Redis instance that is down during a write.

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{
        rows?: unknown[];
        rowCount?: number | null;
    }>>()
);

const mockRedisDel = vi.hoisted(() => vi.fn());

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
    },
}));

vi.mock("@/lib/redis", () => ({
    default: {
        del: mockRedisDel,
    },
}));

function starboardRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: "1",
        guild_id: "123456789012345678",
        starboard_channel_id: "111111111111111111",
        emojis: ["⭐"],
        reaction_threshold: 3,
        min_message_age: null,
        max_message_age: null,
        prevent_self_star: true,
        allow_bot_messages: false,
        role_restriction_type: "NONE",
        restricted_roles: [],
        channel_restriction_type: "NONE",
        restricted_channels: [],
        embed_template: {},
        plaintext_template: "",
        keep_deleted_messages: true,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
        ...overrides,
    };
}

function validInput(overrides: Record<string, unknown> = {}): SaveableStarboardConfig {
    return starboardConfigInputSchema.parse({
        starboard_channel_id: "111111111111111111",
        ...overrides,
    });
}

describe("Starboard Query Module", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("upsertStarboardConfig", () => {
        it("should invalidate the Redis cache after a successful save", async () => {
            mockQuery.mockResolvedValue({ rows: [starboardRow()], rowCount: 1 });

            await upsertStarboardConfig("123456789012345678", validInput());

            expect(mockRedisDel).toHaveBeenCalledWith("starboard:config:123456789012345678");
        });

        it("should still save when Redis cache invalidation throws", async () => {
            mockQuery.mockResolvedValue({ rows: [starboardRow()], rowCount: 1 });
            mockRedisDel.mockRejectedValue(new Error("Redis down"));

            const saved = await upsertStarboardConfig("123456789012345678", validInput());

            expect(saved.id).toBe("1");
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(upsertStarboardConfig("123456789012345678", validInput())).rejects.toThrow(
                "connection lost"
            );
        });
    });

    describe("deleteStarboardConfig", () => {
        it("should invalidate the Redis cache after a successful delete", async () => {
            mockQuery.mockResolvedValue({ rowCount: 1 });

            expect(await deleteStarboardConfig("42", "123456789012345678")).toBe(true);
            expect(mockRedisDel).toHaveBeenCalledWith("starboard:config:123456789012345678");
        });

        it("should not invalidate the cache when no row matched", async () => {
            mockQuery.mockResolvedValue({ rowCount: 0 });

            expect(await deleteStarboardConfig("999", "123456789012345678")).toBe(false);
            expect(mockRedisDel).not.toHaveBeenCalled();
        });

        it("should still return the result when Redis cache invalidation throws", async () => {
            mockQuery.mockResolvedValue({ rowCount: 1 });
            mockRedisDel.mockRejectedValue(new Error("Redis down"));

            expect(await deleteStarboardConfig("42", "123456789012345678")).toBe(true);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(deleteStarboardConfig("42", "123456789012345678")).rejects.toThrow(
                "connection lost"
            );
        });
    });
});