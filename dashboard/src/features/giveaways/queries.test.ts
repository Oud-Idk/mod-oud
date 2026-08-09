import { describe, it, expect, vi, beforeEach } from "vitest";
import { getGiveaways, saveGiveaway, deleteGiveaway } from "./queries";
import { saveGiveawayInputSchema, type SaveGiveawayData } from "./types";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{
        rows?: unknown[];
        rowCount?: number | null;
    }>>()
);

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
    },
}));

const END_TIME = "2026-12-31T23:59:59.000Z";

function createMockGiveawayRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: 1,
        guild_id: "guild_123",
        host_id: "user_123",
        channel_id: "chan_1",
        message_id: null,
        prize: "Nitro",
        winner_count: 2,
        end_time: END_TIME,
        is_finished: false,
        message: { format: "TEXT", content: "🎉 Win stuff!", embed: {} },
        ...overrides,
    };
}

function createValidInput(overrides: Record<string, unknown> = {}): SaveGiveawayData {
    return saveGiveawayInputSchema.parse({
        guild_id: "guild_123",
        host_id: "user_123",
        channel_id: "chan_1",
        prize: "Nitro",
        winner_count: 2,
        end_time: END_TIME,
        ...overrides,
    });
}

describe("Giveaways Query Module", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getGiveaways", () => {
        it("should query the database for the guild and parse rows", async () => {
            mockQuery.mockResolvedValue({
                rows: [createMockGiveawayRow()],
                rowCount: 1,
            });

            const result = await getGiveaways("guild_123");

            expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["guild_123"]);
            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                id: 1,
                guild_id: "guild_123",
                prize: "Nitro",
                winner_count: 2,
                end_time: END_TIME,
            });
        });

        it("should return an empty array when no rows exist", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            const result = await getGiveaways("guild_empty");

            expect(result).toEqual([]);
        });

        it("should coerce string ids/winner counts and convert Date end_time to ISO", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    createMockGiveawayRow({
                        id: "7",
                        winner_count: "3",
                        end_time: new Date("2026-01-01T00:00:00.000Z"),
                    }),
                ],
                rowCount: 1,
            });

            const result = await getGiveaways("guild_123");

            expect(result[0].id).toBe(7);
            expect(result[0].winner_count).toBe(3);
            expect(result[0].end_time).toBe("2026-01-01T00:00:00.000Z");
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getGiveaways("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveGiveaway", () => {
        it("should execute an INSERT query for a new giveaway without an id", async () => {
            mockQuery.mockResolvedValue({
                rows: [createMockGiveawayRow()],
                rowCount: 1,
            });

            const data = createValidInput({ id: undefined, message_id: null });
            const saved = await saveGiveaway(data);

            expect(saved.id).toBe(1);
            expect(saved.prize).toBe("Nitro");

            const [queryStr, params = []] = mockQuery.mock.calls[0];
            expect(queryStr).toContain("INSERT INTO giveaways");
            expect(queryStr).not.toContain("UPDATE giveaways");
            expect(params[0]).toBe("chan_1");
            expect(params[6]).toBe(JSON.stringify({ enabled: true, ...data.message }));
        });

        it("should persist the message layout with enabled forced to true", async () => {
            mockQuery.mockResolvedValue({
                rows: [createMockGiveawayRow()],
                rowCount: 1,
            });

            const data = createValidInput({
                message: { format: "TEXT", content: "custom", embed: {} },
            });
            await saveGiveaway(data);

            const [, params = []] = mockQuery.mock.calls[0];
            expect(JSON.parse(String(params[6]))).toEqual({
                enabled: true,
                format: "TEXT",
                content: "custom",
                embed: {},
            });
        });

        it("should pass the default winner_count when not configured", async () => {
            mockQuery.mockResolvedValue({
                rows: [createMockGiveawayRow({ winner_count: 1 })],
                rowCount: 1,
            });

            const data = createValidInput({ winner_count: undefined });
            const saved = await saveGiveaway(data);

            const [, params = []] = mockQuery.mock.calls[0];
            expect(params[3]).toBe(1);
            expect(saved.winner_count).toBe(1);
        });

        it("should execute an UPDATE query scoped to id AND guild_id when id is present", async () => {
            mockQuery.mockResolvedValue({
                rows: [createMockGiveawayRow({ id: 7 })],
                rowCount: 1,
            });

            await saveGiveaway(createValidInput({ id: 7 }));

            const [queryStr, params = []] = mockQuery.mock.calls[0];
            expect(queryStr).toContain("UPDATE giveaways");
            expect(queryStr).toContain("WHERE id = $8 AND guild_id = $2");
            expect(params[params.length - 1]).toBe(7);
            expect(params[1]).toBe("guild_123");
        });

        it("should reject an invalid payload before hitting the database", async () => {
            const data = createValidInput({ channel_id: null });

            await expect(saveGiveaway(data)).rejects.toThrow(
                "Please select a target Discord channel for the giveaway!"
            );
            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("SpicyWolf exploded"));

            await expect(saveGiveaway(createValidInput())).rejects.toThrow("SpicyWolf exploded");
        });
    });

    describe("deleteGiveaway", () => {
        it("should delete using both id AND guildId for multi-tenant safety", async () => {
            mockQuery.mockResolvedValue({ rowCount: 1 });

            const result = await deleteGiveaway(42, "guild_123");

            expect(result).toBe(true);
            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("WHERE id = $1 AND guild_id = $2"),
                [42, "guild_123"]
            );
        });

        it("should return false when no row matches id + guildId", async () => {
            mockQuery.mockResolvedValue({ rowCount: 0 });

            const result = await deleteGiveaway(999, "guild_123");

            expect(result).toBe(false);
        });

        it("should return false when rowCount is null", async () => {
            mockQuery.mockResolvedValue({ rowCount: null });

            const result = await deleteGiveaway(1, "guild_123");

            expect(result).toBe(false);
        });

        it("should reject invalid ids before querying", async () => {
            await expect(deleteGiveaway(0, "guild_123")).rejects.toThrow();
            expect(mockQuery).not.toHaveBeenCalled();
        });
    });
});
