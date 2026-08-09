import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { saveLeaveConfigAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveLeaveConfig } from "@/features/leave/queries";
import { revalidatePath } from "next/cache";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/leave/queries", () => ({
    saveLeaveConfig: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

describe("Leave Server Actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockUser: Awaited<ReturnType<typeof verifyGuildAccess>> = {
        id: "user_123",
        name: "Test User",
    };

    const validLeaveConfig = {
        enabled: true,
        channelId: "chan_1",
        message: {
            format: "TEXT" as const,
            content: "Sad to see you go!",
            embed: {},
        },
    };

    describe("saveLeaveConfigAction", () => {
        it("should verify access, save the config, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await saveLeaveConfigAction("guild_123", validLeaveConfig);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveLeaveConfig).toHaveBeenCalledWith("guild_123", validLeaveConfig);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/leave");
        });

        it("should REJECT when enabled without a channel", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await expect(
                saveLeaveConfigAction("guild_123", {
                    ...validLeaveConfig,
                    channelId: null,
                })
            ).rejects.toThrow("Please select a channel for leave messages!");

            expect(saveLeaveConfig).not.toHaveBeenCalled();
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(
                saveLeaveConfigAction("guild_123", validLeaveConfig)
            ).rejects.toThrow("Forbidden");

            expect(saveLeaveConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should propagate a non-Zod database error", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveLeaveConfig).mockRejectedValue(new Error("db exploded"));

            await expect(
                saveLeaveConfigAction("guild_123", validLeaveConfig)
            ).rejects.toThrow("db exploded");
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveLeaveConfig).mockRejectedValue("string throw");

            await expect(
                saveLeaveConfigAction("guild_123", validLeaveConfig)
            ).rejects.toThrow("Could not save configuration.");
        });

        it("should rethrow the first zod issue message when saving rejects with a ZodError", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveLeaveConfig).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Leave config save validation failure", path: [] },
                ])
            );

            await expect(
                saveLeaveConfigAction("guild_123", validLeaveConfig)
            ).rejects.toThrow("Leave config save validation failure");
        });

        it("should fall back to 'Validation Error' when the zod error has no issues", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveLeaveConfig).mockRejectedValue(new z.ZodError([]));

            await expect(
                saveLeaveConfigAction("guild_123", validLeaveConfig)
            ).rejects.toThrow("Validation Error");
        });
    });
});
