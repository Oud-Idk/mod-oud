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

// Row mapping, SQL shape, tenant scoping and constraints live in
// queries.integration.test.ts against a real database. What stays here is the
// behaviour a real database will not produce on demand: input validation that
// skips the query, a failing connection and a null rowCount.

const END_TIME = "2026-12-31T23:59:59.000Z";

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
        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getGiveaways("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveGiveaway", () => {
        it("should reject an invalid payload before hitting the database", async () => {
            const data = createValidInput({ channel_id: null });

            await expect(saveGiveaway("guild_123", data)).rejects.toThrow(
                "Please select a target Discord channel for the giveaway!"
            );
            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("Spicy's single brain cell is currently busy buffer overflowing"));

            await expect(saveGiveaway("guild_123", createValidInput())).rejects.toThrow("Spicy's single brain cell is currently busy buffer overflowing");
        });
    });

    describe("deleteGiveaway", () => {
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
