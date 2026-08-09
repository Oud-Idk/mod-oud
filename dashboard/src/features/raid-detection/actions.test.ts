import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveRaidDetectionConfigAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveRaidDetectionConfig } from "@/features/raid-detection/queries";
import { revalidatePath } from "next/cache";
import { raidDetectionInputSchema } from "@/features/raid-detection/types";

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
        vi.spyOn(console, "error").mockImplementation(() => {});
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
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(saveRaidDetectionConfigAction("guild_123", validConfig)).rejects.toThrow(
                "Forbidden"
            );

            expect(saveRaidDetectionConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should propagate a non-Zod database error", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveRaidDetectionConfig).mockRejectedValue(new Error("db exploded"));

            await expect(saveRaidDetectionConfigAction("guild_123", validConfig)).rejects.toThrow(
                "db exploded"
            );
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveRaidDetectionConfig).mockRejectedValue("string throw");

            await expect(saveRaidDetectionConfigAction("guild_123", validConfig)).rejects.toThrow(
                "Could not save configuration."
            );
        });
    });
});
