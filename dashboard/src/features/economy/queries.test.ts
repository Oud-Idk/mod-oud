import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getEconomyConfig, saveEconomyConfig } from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import type { EconomyConfig } from "@/features/economy/types";

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

describe("Economy Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => { return; });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getEconomyConfig", () => {
        it("should return default config when DB returns null", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getEconomyConfig("guild_123");

            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "economy");
            expect(result.enabled).toBe(false);
            expect(result.currencyName).toBe("coins");
            expect(result.workCooldownSecs).toBe(3600);
            expect(result.workMinReward).toBe(1000);
            expect(result.workMaxReward).toBe(5000);
        });

        it("should merge partial saved DB config with Zod defaults", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({
                enabled: true,
                currencyName: "rubies",
            });

            const result = await getEconomyConfig("guild_123");

            expect(result.enabled).toBe(true);
            expect(result.currencyName).toBe("rubies");
            expect(result.workCooldownSecs).toBe(3600);
            expect(result.workMinReward).toBe(1000);
            expect(result.workMaxReward).toBe(5000);
        });

        it("should propagate a database error from getGuildConfigField", async () => {
            vi.mocked(getGuildConfigField).mockRejectedValue(
                new Error("Database connection lost in the coin vault")
            );

            await expect(getEconomyConfig("guild_123")).rejects.toThrow(
                "Database connection lost in the coin vault"
            );
        });
    });

    describe("saveEconomyConfig", () => {
        it("should save the config under the economy key", async () => {
            const config = economyConfigFixture();

            await saveEconomyConfig("guild_123", config);

            expect(saveGuildConfigField).toHaveBeenCalledWith(
                "guild_123",
                "economy",
                config
            );
        });

        it("should propagate a database error from saveGuildConfigField", async () => {
            vi.mocked(saveGuildConfigField).mockRejectedValue(
                new Error("Failed to write to economy ledger")
            );

            await expect(
                saveEconomyConfig("guild_123", economyConfigFixture())
            ).rejects.toThrow("Failed to write to economy ledger");
        });
    });
});

function economyConfigFixture(): EconomyConfig {
    return {
        enabled: true,
        currencyName: "diamonds",
        workCooldownSecs: 1800,
        workMinReward: 500,
        workMaxReward: 2500,
    };
}