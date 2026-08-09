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

function createMockLevelRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        guild_id: "guild_123",
        user_id: "user_123",
        cumulative_xp: 1500,
        current_level: 10,
        current_xp: 100,
        username: "SpicyWolf",
        ...overrides,
    };
}

describe("Leveling Query Module", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {return});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getLevels", () => {
        it("should query the database for the guild and parse rows", async () => {
            mockQuery.mockResolvedValue({ rows: [createMockLevelRow()], rowCount: 1 });

            const result = await getLevels("guild_123");

            expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["guild_123"]);
            expect(result).toHaveLength(1);
            expect(result[0]).toMatchObject({
                guild_id: "guild_123",
                user_id: "user_123",
                cumulative_xp: 1500,
                current_level: 10,
            });
        });

        it("should return an empty array when no rows exist", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            const result = await getLevels("guild_empty");

            expect(result).toEqual([]);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getLevels("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("fetchMoreLevels", () => {
        it("should query with guildId and the lowest XP cursor", async () => {
            mockQuery.mockResolvedValue({
                rows: [createMockLevelRow({ cumulative_xp: 900 })],
                rowCount: 1,
            });

            const result = await fetchMoreLevels("guild_123", 1500);

            expect(mockQuery).toHaveBeenCalledWith(
                expect.any(String),
                ["guild_123", 1500]
            );
            expect(result).toHaveLength(1);
            expect(result[0].cumulative_xp).toBe(900);
        });

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
        it("should query and parse multiplier rows", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        guild_id: "guild_123",
                        target_id: "role_1",
                        target_type: "ROLE",
                        multiplier: 2,
                    },
                ],
                rowCount: 1,
            });

            const result = await getXpMultipliers("guild_123");

            expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("xp_multipliers"), [
                "guild_123",
            ]);
            expect(result[0].multiplier).toBe(2);
        });

        it("should return an empty array when no rows exist", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            const result = await getXpMultipliers("guild_123");

            expect(result).toEqual([]);
        });
    });

    describe("getLevelRewards", () => {
        it("should query and parse reward rows", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: 1,
                        guild_id: "guild_123",
                        level_requirement: 5,
                        roles_to_add: ["role_a"],
                        remove_previous_roles: false,
                    },
                ],
                rowCount: 1,
            });

            const result = await getLevelRewards("guild_123");

            expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("level_rewards"), [
                "guild_123",
            ]);
            expect(result[0].level_requirement).toBe(5);
            expect(result[0].roles_to_add).toEqual(["role_a"]);
        });

        it("should return an empty array when no rows exist", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            const result = await getLevelRewards("guild_123");

            expect(result).toEqual([]);
        });
    });

    describe("saveLevelRewards", () => {
        it("should return early without querying when the rewards array is empty", async () => {
            await saveLevelRewards("guild_123", []);

            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should upsert rewards via JSON_TO_RECORDSET", async () => {
            mockQuery.mockResolvedValue({ rowCount: 1 });

            await saveLevelRewards("guild_123", [
                { levelRequirement: 5, rolesToAdd: ["role_a"], removePreviousRoles: false },
            ]);

            const [queryStr, params = []] = mockQuery.mock.calls[0];
            expect(queryStr).toContain("INSERT INTO level_rewards");
            expect(queryStr).toContain("JSON_TO_RECORDSET($2::JSON)");
            expect(queryStr).toContain("ON CONFLICT (guild_id, level_requirement)");
            expect(params[0]).toBe("guild_123");
            expect(JSON.parse(String(params[1]))).toEqual([
                { level_requirement: 5, roles_to_add: ["role_a"], remove_previous_roles: false },
            ]);
        });
    });

    describe("deleteXpMultipliers", () => {
        it("should return early without querying when targetIds is empty", async () => {
            await deleteXpMultipliers("guild_123", []);

            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should delete with tenant-scoped ANY clause", async () => {
            mockQuery.mockResolvedValue({ rowCount: 1 });

            await deleteXpMultipliers("guild_123", ["role_1", "chan_1"]);

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("WHERE guild_id = $1 AND target_id = ANY($2)"),
                ["guild_123", ["role_1", "chan_1"]]
            );
        });
    });

    describe("saveXpMultipliers", () => {
        it("should return early without querying when targets is empty", async () => {
            await saveXpMultipliers("guild_123", []);

            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should insert multipliers via UNNEST", async () => {
            mockQuery.mockResolvedValue({ rowCount: 1 });

            await saveXpMultipliers("guild_123", [
                { targetId: "role_1", targetType: "ROLE", multiplier: 2 },
                { targetId: "chan_1", targetType: "CHANNEL", multiplier: 1.5 },
            ]);

            const [queryStr, params = []] = mockQuery.mock.calls[0];
            expect(queryStr).toContain("INSERT INTO xp_multipliers");
            expect(queryStr).toContain("UNNEST($2::TEXT[], $3::TEXT[], $4::NUMERIC[])");
            expect(queryStr).toContain("ON CONFLICT (guild_id, target_id)");
            expect(params).toEqual([
                "guild_123",
                ["role_1", "chan_1"],
                ["ROLE", "CHANNEL"],
                [2, 1.5],
            ]);
        });
    });

    describe("deleteLevelRewards", () => {
        it("should return early without querying when ids is empty", async () => {
            await deleteLevelRewards("guild_123", []);

            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should delete with tenant-scoped id ANY clause", async () => {
            mockQuery.mockResolvedValue({ rowCount: 1 });

            await deleteLevelRewards("guild_123", [3, 7]);

            expect(mockQuery).toHaveBeenCalledWith(
                expect.stringContaining("WHERE guild_id = $1 AND id = ANY($2::INTEGER[])"),
                ["guild_123", [3, 7]]
            );
        });
    });
});
