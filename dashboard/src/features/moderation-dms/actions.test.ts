import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import { saveModerationDMsConfigAction } from "./actions";
import { saveModerationDMsConfig } from "@/features/moderation-dms/queries";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { revalidatePath } from "next/cache";
import { moderationDMsConfigSchema, type ModerationDMsConfig } from "@/features/moderation-dms/types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/moderation-dms/queries", () => ({
    saveModerationDMsConfig: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

const actionName = (name: string): { enabled: boolean; message: { format: "TEXT"; content: string; embed: object } } => ({
    enabled: true,
    message: { format: "TEXT", content: `${name} notification sent`, embed: {} },
});

const validConfig = moderationDMsConfigSchema.parse({
    warn: actionName("Warn"),
    pardonWarn: actionName("Pardon"),
    unpardonWarn: actionName("Unpardon"),
    unpardonDeleteWarn: actionName("Unpardon delete"),
    mute: actionName("Mute"),
    unmute: actionName("Unmute"),
    kick: actionName("Kick"),
    ban: actionName("Ban"),
    softban: actionName("Softban"),
    honeypot: actionName("Honeypot"),
}) satisfies ModerationDMsConfig;

describe("Moderation DMs Action Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockUser: Awaited<ReturnType<typeof verifyGuildAccess>> = {
        id: "user_123",
        name: "Test User",
    };

    describe("saveModerationDMsConfigAction", () => {
        it("should verify access, save the config, and revalidate the path", async () => {
            await saveModerationDMsConfigAction("guild_123", validConfig);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveModerationDMsConfig).toHaveBeenCalledWith("guild_123", validConfig);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/moderation-dms");
        });

        it("should throw the underlying error message", async () => {
            vi.mocked(saveModerationDMsConfig).mockRejectedValue(new Error("db down"));

            await expect(
                saveModerationDMsConfigAction("guild_123", validConfig)
            ).rejects.toThrow("db down");
        });

        it("should throw a generic message for non-error rejections", async () => {
            vi.mocked(saveModerationDMsConfig).mockRejectedValue("boom");

            await expect(
                saveModerationDMsConfigAction("guild_123", validConfig)
            ).rejects.toThrow("Could not save configuration.");
        });

        it("should rethrow the first zod issue message on validation errors", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveModerationDMsConfig).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Moderation DMs config validation failure", path: [] },
                ])
            );

            await expect(
                saveModerationDMsConfigAction("guild_123", validConfig)
            ).rejects.toThrow("Moderation DMs config validation failure");
        });

    });
});
