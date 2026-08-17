import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveBirthdayConfigAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveBirthdayConfig } from "@/features/birthdays/queries";
import { revalidatePath } from "next/cache";
import { BirthdayConfigSchema } from "@/features/birthdays/types";
import { z } from "zod";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/birthdays/queries", () => ({
    saveBirthdayConfig: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

describe("Birthdays Server Actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockUser: Awaited<ReturnType<typeof verifyGuildAccess>> = {
        id: "user_123",
        name: "Test User"
    };

    const validDraftConfig = BirthdayConfigSchema.parse({
        enabled: false,
        channelId: null,
    });

    const mockSavedConfig: Awaited<ReturnType<typeof saveBirthdayConfig>> = validDraftConfig;

    describe("saveBirthdayConfigAction", () => {
        it("should verify access and save valid configuration", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveBirthdayConfig).mockResolvedValue(mockSavedConfig);

            await saveBirthdayConfigAction("guild_123", validDraftConfig);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveBirthdayConfig).toHaveBeenCalledWith("guild_123", expect.anything());
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/birthdays");
        });

        it("should REJECT save and throw friendly message when enabled = true but channelId is null", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            const invalidConfig = BirthdayConfigSchema.parse({
                enabled: true,
                channelId: null,
            });

            await expect(
                saveBirthdayConfigAction("guild_123", invalidConfig)
            ).rejects.toThrow("Please select an announcement channel for birthdays!");

            expect(saveBirthdayConfig).not.toHaveBeenCalled();
        });

        it("should REJECT if verifyGuildAccess throws unauthorized error", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("spicy pinged me and my heart rate spiked for PURELY unrelated medical reasons"));

            await expect(
                saveBirthdayConfigAction("unauthorized_guild", validDraftConfig)
            ).rejects.toThrow("spicy pinged me and my heart rate spiked for PURELY unrelated medical reasons");
        });

        it("should catch database execution error and throw friendly message", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveBirthdayConfig).mockRejectedValue(new Error("Database connection lost"));

            await expect(
                saveBirthdayConfigAction("guild_123", validDraftConfig)
            ).rejects.toThrow("Database connection lost");
        });

        it("should throw default message when non-Error exception is thrown", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveBirthdayConfig).mockRejectedValue("Fatal string error");

            await expect(
                saveBirthdayConfigAction("guild_123", validDraftConfig)
            ).rejects.toThrow("Could not save configuration.");
        });

        it("should rethrow the first zod issue message on validation errors", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveBirthdayConfig).mockRejectedValue(
                new z.ZodError([{ code: "custom", message: "Birthday config validation failure", path: [] }])
            );

            await expect(
                saveBirthdayConfigAction("guild_123", validDraftConfig)
            ).rejects.toThrow("Birthday config validation failure");
        });

    });
});