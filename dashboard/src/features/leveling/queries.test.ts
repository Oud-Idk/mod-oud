import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    getLevels,
    fetchMoreLevels,
    getLevelingConfig,
    saveLevelingConfig,
    getXpMultipliers,
    getLevelRewards,
    saveLevelRewards,
    deleteXpMultipliers,
    saveXpMultipliers,
    deleteLevelRewards,
} from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { levelingConfigSchema } from "./types";

// Row mapping, SQL shape, tenant scoping and constraints live in
// queries.integration.test.ts against a real database. What stays here is the
// behaviour a real database will not produce on demand: a failing connection,
// the fetchMoreLevels error swallow, and the early returns that skip the query.

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

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

describe("Leveling Query Module", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => { return; });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getLevels", () => {
        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getLevels("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("fetchMoreLevels", () => {
        it("should return an empty array on a database error instead of throwing", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            const result = await fetchMoreLevels("guild_123", 1500);

            expect(result).toEqual([]);
        });
    });

    describe("getLevelingConfig", () => {
        it("should return defaults when the DB row is missing", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const config = await getLevelingConfig("guild_123");

            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "leveling");
            expect(config.levelCap).toBe(40);
            expect(config.notify.scope).toBe("NONE");
        });

        it("should parse the stored config from the DB", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({ levelCap: 100, keepLevelOnLeave: true });

            const config = await getLevelingConfig("guild_123");

            expect(config.levelCap).toBe(100);
            expect(config.keepLevelOnLeave).toBe(true);
        });
    });

    describe("saveLevelingConfig", () => {
        it("should persist the config through the shared guild config field", async () => {
            const config = levelingConfigSchema.parse({});

            await saveLevelingConfig("guild_123", config);

            expect(saveGuildConfigField).toHaveBeenCalledWith("guild_123", "leveling", config);
            expect(mockQuery).not.toHaveBeenCalled();
        });
    });

    describe("getXpMultipliers", () => {
        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getXpMultipliers("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("getLevelRewards", () => {
        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getLevelRewards("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveLevelRewards", () => {
        it("should return early without querying when the rewards array is empty", async () => {
            await saveLevelRewards("guild_123", []);

            expect(mockQuery).not.toHaveBeenCalled();
        });
    });

    describe("deleteXpMultipliers", () => {
        it("should return early without querying when targetIds is empty", async () => {
            await deleteXpMultipliers("guild_123", []);

            expect(mockQuery).not.toHaveBeenCalled();
        });
    });

    describe("saveXpMultipliers", () => {
        it("should return early without querying when targets is empty", async () => {
            await saveXpMultipliers("guild_123", []);

            expect(mockQuery).not.toHaveBeenCalled();
        });
    });

    describe("deleteLevelRewards", () => {
        it("should return early without querying when ids is empty", async () => {
            await deleteLevelRewards("guild_123", []);

            expect(mockQuery).not.toHaveBeenCalled();
        });
    });
});