import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveEconomyConfigAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveEconomyConfig } from "@/features/economy/queries";
import { type EconomyConfigInput, economyConfigSchema } from "@/features/economy/types";
import { revalidatePath } from "next/cache";
import { z } from "zod";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/economy/queries", () => ({
    saveEconomyConfig: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

describe("Economy Server Actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {return;});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockUser: Awaited<ReturnType<typeof verifyGuildAccess>> = {
        id: "user_123",
        name: "Test User",
    };

    const mockInput: EconomyConfigInput = {
        enabled: true,
        currencyName: "Coins",
        workCooldownSecs: 60,
        workMinReward: 10,
        workMaxReward: 50,
    };

    describe("saveEconomyConfigAction", () => {
        it("should verify access, validate and save the config, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await saveEconomyConfigAction("guild_123", mockInput);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveEconomyConfig).toHaveBeenCalledWith("guild_123", expect.anything());
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/economy");
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(
                new Error("Unauthorized guild access")
            );

            await expect(
                saveEconomyConfigAction("guild_123", { enabled: true })
            ).rejects.toThrow("Unauthorized guild access");

            expect(saveEconomyConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should reject invalid inputs with a Zod validation error message", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            vi.spyOn(economyConfigSchema, "parse").mockImplementationOnce(() => {
                throw new z.ZodError([
                    {
                        code: "custom",
                        message: "Invalid currency configuration",
                        path: ["currency_name"],
                    },
                ]);
            });

            await expect(
                saveEconomyConfigAction("guild_123", { enabled: true })
            ).rejects.toThrow("Invalid currency configuration");

            expect(saveEconomyConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should propagate a database error thrown by saveEconomyConfig", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveEconomyConfig).mockRejectedValue(
                new Error("Database connection failed")
            );

            await expect(
                saveEconomyConfigAction("guild_123", { enabled: true })
            ).rejects.toThrow("Database connection failed");

            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveEconomyConfig).mockRejectedValue("unexpected string throw");

            await expect(
                saveEconomyConfigAction("guild_123", { enabled: true })
            ).rejects.toThrow("Could not save configuration.");
        });

        it("should rethrow the first zod issue message if a ZodError is thrown downstream", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveEconomyConfig).mockRejectedValue(
                new z.ZodError([
                    {
                        code: "custom",
                        message: "Downstream schema validation failure",
                        path: [],
                    },
                ])
            );

            await expect(
                saveEconomyConfigAction("guild_123", { enabled: true })
            ).rejects.toThrow("Downstream schema validation failure");
        });
    });
});