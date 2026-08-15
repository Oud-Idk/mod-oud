import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
    deleteMultipliersAction,
    saveMultipliersAction,
    saveRewardsAction,
    deleteRewardsAction,
    fetchMoreLevelsAction,
    saveLevelingConfigAction,
} from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import {
    deleteXpMultipliers,
    saveXpMultipliers,
    saveLevelRewards,
    deleteLevelRewards,
    fetchMoreLevels,
    saveLevelingConfig,
} from "@/features/leveling/queries";
import { revalidatePath } from "next/cache";
import {
    levelingConfigSchema,
    type SaveLevelRewardInput,
    type SaveXpMultiplierInput,
} from "@/features/leveling/types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/leveling/queries", () => ({
    deleteXpMultipliers: vi.fn(),
    saveXpMultipliers: vi.fn(),
    saveLevelRewards: vi.fn(),
    deleteLevelRewards: vi.fn(),
    fetchMoreLevels: vi.fn(),
    saveLevelingConfig: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

describe("Leveling Server Actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {return});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockUser: Awaited<ReturnType<typeof verifyGuildAccess>> = {
        id: "user_123",
        name: "Test User",
    };

    describe("deleteMultipliersAction", () => {
        it("should verify access, delete multipliers, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await deleteMultipliersAction("guild_123", ["role_1"]);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(deleteXpMultipliers).toHaveBeenCalledWith("guild_123", ["role_1"]);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/leveling");
        });

        it("should NOT delete when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(deleteMultipliersAction("guild_123", ["role_1"])).rejects.toThrow(
                "Forbidden"
            );

            expect(deleteXpMultipliers).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteXpMultipliers).mockRejectedValue("string throw");

            await expect(deleteMultipliersAction("guild_123", ["role_1"])).rejects.toThrow(
                "Could not delete multipliers."
            );
        });

        it("should rethrow the first zod issue message on validation errors", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteXpMultipliers).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Multiplier deletion validation failure", path: [] },
                ])
            );

            await expect(deleteMultipliersAction("guild_123", ["role_1"])).rejects.toThrow(
                "Multiplier deletion validation failure"
            );
        });

    });

    describe("saveMultipliersAction", () => {
        const validTargets: SaveXpMultiplierInput[] = [
            { targetId: "role_1", targetType: "ROLE", multiplier: 2 },
        ];

        it("should verify access, save multipliers, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await saveMultipliersAction("guild_123", validTargets);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveXpMultipliers).toHaveBeenCalledWith("guild_123", validTargets);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/leveling");
        });

        it("should reject invalid multipliers before saving", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await expect(
                saveMultipliersAction("guild_123", [
                    { targetId: "", targetType: "ROLE", multiplier: 1 },
                ])
            ).rejects.toThrow("Target ID is required");

            expect(saveXpMultipliers).not.toHaveBeenCalled();
        });

        it("should propagate an error when verifyGuildAccess fails", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(saveMultipliersAction("guild_123", validTargets)).rejects.toThrow(
                "Forbidden"
            );

            expect(saveXpMultipliers).not.toHaveBeenCalled();
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveXpMultipliers).mockRejectedValue("string throw");

            await expect(saveMultipliersAction("guild_123", validTargets)).rejects.toThrow(
                "Could not save multipliers."
            );
        });

        it("should rethrow the first zod issue message on validation errors", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveXpMultipliers).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Multiplier save validation failure", path: [] },
                ])
            );

            await expect(saveMultipliersAction("guild_123", validTargets)).rejects.toThrow(
                "Multiplier save validation failure"
            );
        });

    });

    describe("saveRewardsAction", () => {
        const validRewards: SaveLevelRewardInput[] = [
            { levelRequirement: 5, rolesToAdd: ["role_a"], removePreviousRoles: false },
        ];

        it("should verify access, save rewards, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await saveRewardsAction("guild_123", validRewards);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveLevelRewards).toHaveBeenCalledWith("guild_123", validRewards);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/leveling");
        });

        it("should reject invalid rewards before saving", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await expect(
                saveRewardsAction("guild_123", [
                    { levelRequirement: 0, rolesToAdd: [], removePreviousRoles: false },
                ])
            ).rejects.toThrow("Level requirement must be at least 1");

            expect(saveLevelRewards).not.toHaveBeenCalled();
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveLevelRewards).mockRejectedValue("string throw");

            await expect(saveRewardsAction("guild_123", validRewards)).rejects.toThrow(
                "Could not save rewards."
            );
        });

        it("should rethrow the first zod issue message on validation errors", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveLevelRewards).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Reward save validation failure", path: [] },
                ])
            );

            await expect(saveRewardsAction("guild_123", validRewards)).rejects.toThrow(
                "Reward save validation failure"
            );
        });

    });

    describe("deleteRewardsAction", () => {
        it("should verify access, delete rewards, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await deleteRewardsAction("guild_123", [1, 2]);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(deleteLevelRewards).toHaveBeenCalledWith("guild_123", [1, 2]);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/leveling");
        });

        it("should reject non-integer ids before deleting", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await expect(deleteRewardsAction("guild_123", [1, 2.5])).rejects.toThrow();

            expect(deleteLevelRewards).not.toHaveBeenCalled();
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteLevelRewards).mockRejectedValue("string throw");

            await expect(deleteRewardsAction("guild_123", [1])).rejects.toThrow(
                "Could not delete rewards."
            );
        });

        it("should rethrow the first zod issue message on validation errors", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteLevelRewards).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Reward deletion validation failure", path: [] },
                ])
            );

            await expect(deleteRewardsAction("guild_123", [1])).rejects.toThrow(
                "Reward deletion validation failure"
            );
        });

    });

    describe("fetchMoreLevelsAction", () => {
        it("should verify access and return the fetched levels without revalidating", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(fetchMoreLevels).mockResolvedValue([
                { guild_id: "guild_123", user_id: "user_1", cumulative_xp: 900, current_level: 8, current_xp: 50, username: "a" },
            ]);

            const result = await fetchMoreLevelsAction("guild_123", 1500);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(fetchMoreLevels).toHaveBeenCalledWith("guild_123", 1500);
            expect(result).toHaveLength(1);
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw a generic error when the query fails", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(fetchMoreLevels).mockRejectedValue(new Error("connection lost"));

            await expect(fetchMoreLevelsAction("guild_123", 1500)).rejects.toThrow(
                "Could not fetch levels."
            );
        });
    });

    describe("saveLevelingConfigAction", () => {
        const validConfig = levelingConfigSchema.parse({
            notify: { message: { format: "TEXT", content: "Level up!" } },
        });

        it("should verify access, validate, save, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await saveLevelingConfigAction("guild_123", validConfig);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveLevelingConfig).toHaveBeenCalledWith("guild_123", validConfig);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/leveling");
        });

        it("should reject SPECIFIED_CHANNEL notifications without a target channel", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            const config = levelingConfigSchema.parse({
                notify: {
                    scope: "SPECIFIED_CHANNEL",
                    channelId: null,
                    message: { format: "TEXT", content: "Level up!" },
                },
            });

            await expect(saveLevelingConfigAction("guild_123", config)).rejects.toThrow(
                "Please select a target channel for level-up notifications!"
            );

            expect(saveLevelingConfig).not.toHaveBeenCalled();
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveLevelingConfig).mockRejectedValue("string throw");

            await expect(saveLevelingConfigAction("guild_123", validConfig)).rejects.toThrow(
                "Could not save configuration."
            );
        });

        it("should rethrow the first zod issue message on validation errors", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveLevelingConfig).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Leveling config validation failure", path: [] },
                ])
            );

            await expect(saveLevelingConfigAction("guild_123", validConfig)).rejects.toThrow(
                "Leveling config validation failure"
            );
        });

    });
});
