import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveMemberCounterConfigAction, setupMemberCounterChannelsAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import {
    saveMemberCounterConfig,
    setupMemberCounterChannels,
} from "@/features/member-counter/queries";
import { revalidatePath } from "next/cache";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/member-counter/queries", () => ({
    saveMemberCounterConfig: vi.fn(),
    setupMemberCounterChannels: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

describe("Member Counter Server Actions", () => {
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

    const validConfig = {
        enabled: true,
        updateIntervalMinutes: 5,
        counters: [
            { id: "c1", channelId: "voice_1", counterType: "TOTAL_MEMBERS" as const, roleId: null, nameTemplate: "👥 {count}" },
        ],
    };

    describe("saveMemberCounterConfigAction", () => {
        it("should verify access, save the config, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await saveMemberCounterConfigAction("guild_123", validConfig);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveMemberCounterConfig).toHaveBeenCalledWith("guild_123", validConfig);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/member-counter");
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(saveMemberCounterConfigAction("guild_123", validConfig)).rejects.toThrow(
                "Forbidden"
            );

            expect(saveMemberCounterConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should propagate a non-Zod database error", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveMemberCounterConfig).mockRejectedValue(new Error("db exploded"));

            await expect(saveMemberCounterConfigAction("guild_123", validConfig)).rejects.toThrow(
                "db exploded"
            );
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveMemberCounterConfig).mockRejectedValue("string throw");

            await expect(saveMemberCounterConfigAction("guild_123", validConfig)).rejects.toThrow(
                "Could not save configuration."
            );
        });
    });

    describe("setupMemberCounterChannelsAction", () => {
        const counters = [validConfig.counters[0]];

        it("should verify access, create channels, and return success", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(setupMemberCounterChannels).mockResolvedValue({
                success: true,
                counters: [{ id: "c1", channelId: "voice_1", counterType: "TOTAL_MEMBERS", roleId: null, nameTemplate: "👥 {count}" }],
            });

            const result = await setupMemberCounterChannelsAction("guild_123", counters);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(setupMemberCounterChannels).toHaveBeenCalledWith("guild_123", counters);
            expect(result.success).toBe(true);
            expect(result.counters).toHaveLength(1);
        });

        it("should NOT create channels when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(setupMemberCounterChannelsAction("guild_123", counters)).rejects.toThrow(
                "Forbidden"
            );

            expect(setupMemberCounterChannels).not.toHaveBeenCalled();
        });

        it("should return a failure result when the backend throws", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(setupMemberCounterChannels).mockRejectedValue(new Error("backend exploded"));

            const result = await setupMemberCounterChannelsAction("guild_123", counters);

            expect(result).toEqual({ success: false, error: "backend exploded" });
        });

        it("should fall back to a generic error message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(setupMemberCounterChannels).mockRejectedValue("string throw");

            const result = await setupMemberCounterChannelsAction("guild_123", counters);

            expect(result).toEqual({
                success: false,
                error: "An unexpected error occurred while creating channels.",
            });
        });
    });
});
