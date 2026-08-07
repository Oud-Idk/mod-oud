// src/features/birthdays/actions.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveBirthdayConfigAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveBirthdayConfig } from "@/features/birthdays/queries";
import { revalidatePath } from "next/cache";

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
        // 🔇 Silence expected console.error logs
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("saveBirthdayConfigAction", () => {
        it("should verify access and save valid configuration", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(true as any);
            vi.mocked(saveBirthdayConfig).mockResolvedValue({} as any);

            const validDraftConfig: any = {
                enabled: false,
                channelId: null,
            };

            await saveBirthdayConfigAction("guild_123", validDraftConfig);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveBirthdayConfig).toHaveBeenCalledWith("guild_123", expect.anything());
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/birthdays");
        });

        it("should REJECT save and throw friendly message when enabled = true but channelId is null", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(true as any);

            const invalidConfig: any = {
                enabled: true,
                channelId: null,
            };

            await expect(
                saveBirthdayConfigAction("guild_123", invalidConfig)
            ).rejects.toThrow("Please select an announcement channel for birthdays!");

            expect(saveBirthdayConfig).not.toHaveBeenCalled();
        });

        it("should REJECT if verifyGuildAccess throws unauthorized error", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Unauthorized access!"));

            await expect(
                saveBirthdayConfigAction("unauthorized_guild", {} as any)
            ).rejects.toThrow("Unauthorized access!");
        });
    });
});