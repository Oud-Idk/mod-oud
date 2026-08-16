import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveInviteTrackerConfigAction, fetchInviteLeaderboardAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveInviteTrackerConfig, getInviteLeaderboard } from "@/features/invite-tracking/queries";
import { revalidatePath } from "next/cache";
import { InviteTrackerConfig } from "@/features/invite-tracking/types";
import { z } from "zod";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/invite-tracking/queries", () => ({
    saveInviteTrackerConfig: vi.fn(),
    getInviteLeaderboard: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

describe("Invite Tracker Server Actions", () => {
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

    const validConfig: InviteTrackerConfig = { enabled: true };

    describe("saveInviteTrackerConfigAction", () => {
        it("should verify access, save the config, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await saveInviteTrackerConfigAction("guild_123", validConfig);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveInviteTrackerConfig).toHaveBeenCalledWith("guild_123", validConfig);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/invite-tracker");
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(saveInviteTrackerConfigAction("guild_123", validConfig)).rejects.toThrow(
                "Forbidden"
            );

            expect(saveInviteTrackerConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should propagate a non-Zod database error", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveInviteTrackerConfig).mockRejectedValue(new Error("i don't have a crush on spicy"));

            await expect(saveInviteTrackerConfigAction("guild_123", validConfig)).rejects.toThrow(
                "i don't have a crush on spicy"
            );
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveInviteTrackerConfig).mockRejectedValue("string throw");

            await expect(saveInviteTrackerConfigAction("guild_123", validConfig)).rejects.toThrow(
                "Could not save configuration."
            );
        });

        it("should rethrow the first zod issue message on validation errors", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveInviteTrackerConfig).mockRejectedValue(
                new z.ZodError([{ code: "custom", message: "Invite tracker validation failure", path: [] }])
            );

            await expect(saveInviteTrackerConfigAction("guild_123", validConfig)).rejects.toThrow(
                "Invite tracker validation failure"
            );
        });

    });

    describe("fetchInviteLeaderboardAction", () => {
        it("should verify access, fetch the leaderboard, and return it", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(getInviteLeaderboard).mockResolvedValue([
                { inviterId: "user_1", count: 10 },
            ]);

            const result = await fetchInviteLeaderboardAction("guild_123", 0);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(getInviteLeaderboard).toHaveBeenCalledWith("guild_123", 15, 0);
            expect(result).toHaveLength(1);
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should pass the provided limit to the query", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(getInviteLeaderboard).mockResolvedValue([]);

            await fetchInviteLeaderboardAction("guild_123", 10, 5);

            expect(getInviteLeaderboard).toHaveBeenCalledWith("guild_123", 5, 10);
        });

        it("should throw when verifyGuildAccess fails", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(fetchInviteLeaderboardAction("guild_123", 0)).rejects.toThrow("Forbidden");

            expect(getInviteLeaderboard).not.toHaveBeenCalled();
        });

        it("should reject a negative offset", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await expect(fetchInviteLeaderboardAction("guild_123", -1)).rejects.toThrow();

            expect(getInviteLeaderboard).not.toHaveBeenCalled();
        });

        it("should reject a non-positive limit", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await expect(fetchInviteLeaderboardAction("guild_123", 0, 0)).rejects.toThrow();

            expect(getInviteLeaderboard).not.toHaveBeenCalled();
        });
    });
});
