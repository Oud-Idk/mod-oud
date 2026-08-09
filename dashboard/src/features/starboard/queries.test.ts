import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getStarboardConfigs, upsertStarboardConfig, deleteStarboardConfig } from "./queries";
import { starboardConfigInputSchema, type SaveableStarboardConfig } from "./types";

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

function createMockStarboardRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: "1",
        guild_id: "guild_123",
        starboard_channel_id: "chan_1",
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

function createValidInput(overrides: Record<string, unknown> = {}): SaveableStarboardConfig {
    return starboardConfigInputSchema.parse({
        starboard_channel_id: "chan_1",
        ...overrides,
    });
}

describe("Starboard Query Module", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {return});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getStarboardConfigs", () => {
        it("should query the database for the guild and parse rows", async () => {
            mockQuery.mockResolvedValue({
                rows: [createMockStarboardRow()],
                rowCount: 1,
            });

            const result = await getStarboardConfigs("guild_123");

            expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["guild_123"]);
            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                id: "1",
                guild_id: "guild_123",
                starboard_channel_id: "chan_1",
                reaction_threshold: 3,
            });
        });

        it("should return an empty array when no rows exist", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            const result = await getStarboardConfigs("guild_empty");

            expect(result).toEqual([]);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getStarboardConfigs("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("upsertStarboardConfig", () => {
        it("should execute an INSERT query for a new config without an id", async () => {
            mockQuery.mockResolvedValue({
                rows: [createMockStarboardRow()],
                rowCount: 1,
            });

            const saved = await upsertStarboardConfig("guild_123", createValidInput({ id: undefined }));

            expect(saved.id).toBe("1");
            expect(saved.starboard_channel_id).toBe("chan_1");

            const [queryStr, params = []] = mockQuery.mock.calls[0];
            expect(queryStr).toContain("INSERT INTO starboards");
            expect(queryStr).not.toContain("ON CONFLICT");
            expect(params[0]).toBe("guild_123");
            expect(params[2]).toEqual(["⭐"]);
            expect(JSON.parse(String(params[12]))).toEqual({});
        });

        it("should stringify the embed_template JSON param", async () => {
            mockQuery.mockResolvedValue({
                rows: [createMockStarboardRow({ embed_template: { title: "Starred" } })],
                rowCount: 1,
            });

            await upsertStarboardConfig(
                "guild_123",
                createValidInput({ embed_template: { title: "Starred", color: 16776960 } })
            );

            const [, params = []] = mockQuery.mock.calls[0];
            expect(JSON.parse(String(params[12]))).toEqual({ title: "Starred", color: 16776960 });
        });

        it("should execute an upsert (INSERT ... ON CONFLICT) when an id is present", async () => {
            mockQuery.mockResolvedValue({
                rows: [createMockStarboardRow()],
                rowCount: 1,
            });

            await upsertStarboardConfig("guild_123", createValidInput({ id: "7" }));

            const [queryStr, params = []] = mockQuery.mock.calls[0];
            expect(queryStr).toContain("INSERT INTO starboards");
            expect(queryStr).toContain("ON CONFLICT (id) DO UPDATE");
            expect(params[0]).toBe("7");
            expect(params[1]).toBe("guild_123");
        });

        it("should invalidate the Redis cache after a successful save", async () => {
            mockQuery.mockResolvedValue({
                rows: [createMockStarboardRow()],
                rowCount: 1,
            });

            await upsertStarboardConfig("guild_123", createValidInput({ id: "7" }));

            expect(mockRedisDel).toHaveBeenCalledWith("starboard:config:guild_123");
        });

        it("should still save when Redis cache invalidation throws", async () => {
            mockQuery.mockResolvedValue({
                rows: [createMockStarboardRow()],
                rowCount: 1,
            });
            mockRedisDel.mockRejectedValue(new Error("Redis down"));

            const saved = await upsertStarboardConfig("guild_123", createValidInput());

            expect(saved.id).toBe("1");
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(upsertStarboardConfig("guild_123", createValidInput())).rejects.toThrow(
                "connection lost"
            );
        });
    });

    describe("deleteStarboardConfig", () => {
        it("should delete using both id AND guildId for multi-tenant safety", async () => {
            mockQuery.mockResolvedValue({ rowCount: 1 });

            const result = await deleteStarboardConfig("42", "guild_123");

            expect(result).toBe(true);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("WHERE id = $1::bigint AND guild_id = $2"),
                ["42", "guild_123"]
            );
            expect(mockRedisDel).toHaveBeenCalledWith("starboard:config:guild_123");
        });

        it("should return false when no row matches id + guildId", async () => {
            mockQuery.mockResolvedValue({ rowCount: 0 });

            const result = await deleteStarboardConfig("999", "guild_123");

            expect(result).toBe(false);
            expect(mockRedisDel).not.toHaveBeenCalled();
        });

        it("should return false when rowCount is null", async () => {
            mockQuery.mockResolvedValue({ rowCount: null });

            const result = await deleteStarboardConfig("1", "guild_123");

            expect(result).toBe(false);
            expect(mockRedisDel).not.toHaveBeenCalled();
        });

        it("should still return the result when Redis cache invalidation throws", async () => {
            mockQuery.mockResolvedValue({ rowCount: 1 });
            mockRedisDel.mockRejectedValue(new Error("Redis down"));

            const result = await deleteStarboardConfig("42", "guild_123");

            expect(result).toBe(true);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(deleteStarboardConfig("42", "guild_123")).rejects.toThrow("connection lost");
        });
    });
});
