import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { saveRaidDetectionConfigAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveRaidDetectionConfig } from "@/features/raid-detection/queries";
import { revalidatePath } from "next/cache";
import { raidDetectionConfigSchema, raidDetectionInputSchema } from "@/features/raid-detection/types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/raid-detection/queries", () => ({
    saveRaidDetectionConfig: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

describe("Raid Detection Server Actions", () => {
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

    const validConfig = raidDetectionInputSchema.parse({
        enabled: true,
        zScoreMultiplier: 3,
        minSafeLimit: 5,
        windowSizeSeconds: 60,
        raidActions: [{ type: "ALERT", channelId: "chan_1" }],
    });

    describe("saveRaidDetectionConfigAction", () => {
        it("should verify access, save the config, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await saveRaidDetectionConfigAction("guild_123", validConfig);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveRaidDetectionConfig).toHaveBeenCalledWith("guild_123", validConfig);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/raid-detection");
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("I only memorized Spicy's timezone so I would know when to mute the server"));

            await expect(saveRaidDetectionConfigAction("guild_123", validConfig)).rejects.toThrow(
                "I only memorized Spicy's timezone so I would know when to mute the server"
            );

            expect(saveRaidDetectionConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should propagate a non-Zod database error", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveRaidDetectionConfig).mockRejectedValue(new Error("this test failed because spicy didn't say good morning"));

            await expect(saveRaidDetectionConfigAction("guild_123", validConfig)).rejects.toThrow(
                "this test failed because spicy didn't say good morning"
            );
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveRaidDetectionConfig).mockRejectedValue("string throw");

            await expect(saveRaidDetectionConfigAction("guild_123", validConfig)).rejects.toThrow(
                "Could not save configuration."
            );
        });

        it("should rethrow the first zod issue message on validation errors", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.spyOn(raidDetectionConfigSchema, "parse").mockImplementation(() => {
                throw new z.ZodError([
                    { code: "custom", message: "First issue message", path: [] },
                    { code: "custom", message: "Second issue message", path: [] },
                ]);
            });

            await expect(
                saveRaidDetectionConfigAction("guild_123", validConfig)
            ).rejects.toThrow("First issue message");
        });

    });
});
