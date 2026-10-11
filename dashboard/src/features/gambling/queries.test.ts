import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getGamblingConfig, saveGamblingConfig } from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import type { GamblingConfig } from "./types";

// The tenant scoping and the "gambling" config key live in _shared/guild and are
// covered there. What stays here is the behaviour of this module: the key it
// reads and writes, and the Zod parse that turns a stored blob into a config.

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

const GUILD_ID = "guild_123";

describe("Gambling Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getGamblingConfig", () => {
        it("should return default config when DB returns null", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getGamblingConfig(GUILD_ID);

            expect(getGuildConfigField).toHaveBeenCalledWith(GUILD_ID, "gambling");
            expect(result).toEqual({
                enabled: false,
                cooldownSecs: 0,
                minBet: 10,
                maxBet: 0,
                timeoutSecs: 60,
                blackjack: { enabled: true },
                coinflip: { enabled: true },
                slots: { enabled: true },
                roulette: { enabled: true },
                higherlower: { enabled: true },
            });
        });

        it("should merge partial saved DB config with Zod defaults", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({
                enabled: true,
                minBet: 250,
            });

            const result = await getGamblingConfig(GUILD_ID);

            expect(result.enabled).toBe(true);
            expect(result.minBet).toBe(250);
            expect(result.maxBet).toBe(0);
            expect(result.timeoutSecs).toBe(60);
            expect(result.slots).toEqual({ enabled: true });
        });

        it("should keep every field of a fully populated config", async () => {
            const stored: GamblingConfig = {
                enabled: true,
                cooldownSecs: 900,
                minBet: 10,
                maxBet: 20,
                timeoutSecs: 300,
                blackjack: { enabled: false },
                coinflip: { enabled: true },
                slots: { enabled: false },
                roulette: { enabled: true },
                higherlower: { enabled: false },
            };
            vi.mocked(getGuildConfigField).mockResolvedValue(stored);

            expect(await getGamblingConfig(GUILD_ID)).toEqual(stored);
        });

        it("should reject a stored blob whose maxBet sits below minBet", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({ minBet: 1000, maxBet: 10 });

            await expect(getGamblingConfig(GUILD_ID)).rejects.toThrow(
                "Maximum bet must be 0 (no cap) or >= minimum bet."
            );
        });

        it("should propagate a database error from getGuildConfigField", async () => {
            vi.mocked(getGuildConfigField).mockRejectedValue(
                new Error("Database connection lost in the vault")
            );

            await expect(getGamblingConfig(GUILD_ID)).rejects.toThrow(
                "Database connection lost in the vault"
            );
        });
    });

    describe("saveGamblingConfig", () => {
        it("should save the config under the gambling key", async () => {
            const config = gamblingConfigFixture();

            await saveGamblingConfig(GUILD_ID, config);

            expect(saveGuildConfigField).toHaveBeenCalledWith(GUILD_ID, "gambling", config);
        });

        it("should propagate a database error from saveGuildConfigField", async () => {
            vi.mocked(saveGuildConfigField).mockRejectedValue(
                new Error("Failed to write to the gambling ledger")
            );

            await expect(saveGamblingConfig(GUILD_ID, gamblingConfigFixture())).rejects.toThrow(
                "Failed to write to the gambling ledger"
            );
        });
    });
});

function gamblingConfigFixture(): GamblingConfig {
    return {
        enabled: true,
        cooldownSecs: 1800,
        minBet: 500,
        maxBet: 25000,
        timeoutSecs: 120,
        blackjack: { enabled: true },
        coinflip: { enabled: true },
        slots: { enabled: true },
        roulette: { enabled: true },
        higherlower: { enabled: true },
    };
}