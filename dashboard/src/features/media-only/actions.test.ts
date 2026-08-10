import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveMediaOnlyChannelsAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveMediaOnlyChannels } from "./queries";
import redis from "@/lib/redis";
import { revalidatePath } from "next/cache";
import type { MediaOnlyChannel } from "./types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/media-only/queries", () => ({
    saveMediaOnlyChannels: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
    default: {
        del: vi.fn(),
    },
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

describe("Media-Only Server Actions", (): void => {
    beforeEach((): void => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation((): void => {return});
    });

    afterEach((): void => {
        vi.restoreAllMocks();
    });

    const mockUser: Awaited<ReturnType<typeof verifyGuildAccess>> = {
        id: "user_123",
        name: "Test User",
    };

    describe("saveMediaOnlyChannelsAction", (): void => {
        it("should verify access, save channels batched, delete removed ones, and clear Redis cache", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveMediaOnlyChannels).mockResolvedValue(undefined);

            await saveMediaOnlyChannelsAction("guild_123", [channelFixture({ channelId: "chan_1" })], ["chan_removed"]);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveMediaOnlyChannels).toHaveBeenCalledWith(
                "guild_123",
                [channelFixture({ channelId: "chan_1" })],
                ["chan_removed"]
            );
            expect(redis.del).toHaveBeenCalledWith(["media_channel:chan_1", "media_channel:chan_removed"]);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/media-only");
        });

        it("should NOT save or clear cache when verifyGuildAccess throws", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(
                saveMediaOnlyChannelsAction("guild_123", [channelFixture()], [])
            ).rejects.toThrow("Forbidden");

            expect(saveMediaOnlyChannels).not.toHaveBeenCalled();
            expect(redis.del).not.toHaveBeenCalled();
        });

        it("should REJECT a channel with a missing channelId", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await expect(
                saveMediaOnlyChannelsAction("guild_123", [
                    { ...channelFixture(), channelId: "" },
                ], [])
            ).rejects.toThrow("channel");

            expect(saveMediaOnlyChannels).not.toHaveBeenCalled();
        });

        it("should not fail the save when Redis del throws", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(redis.del).mockRejectedValue(new Error("Redis down"));

            await saveMediaOnlyChannelsAction("guild_123", [channelFixture()], []);

            expect(saveMediaOnlyChannels).toHaveBeenCalled();
            expect(revalidatePath).toHaveBeenCalled();
        });

        it("should propagate a DB error from saveMediaOnlyChannels", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveMediaOnlyChannels).mockRejectedValue(new Error("db exploded"));

            await expect(
                saveMediaOnlyChannelsAction("guild_123", [channelFixture()], [])
            ).rejects.toThrow("db exploded");
        });
    });
});

function channelFixture(overrides: Partial<MediaOnlyChannel> = {}): MediaOnlyChannel {
    return {
        channelId: "chan_1",
        enabled: true,
        allowImages: true,
        allowVideos: true,
        allowAudio: false,
        allowGif: true,
        allowLinks: true,
        allowEmbeddedText: true,
        autoThread: false,
        threadNameTemplate: "Discussion - {user}",
        deleteWarningAfterSecs: 5,
        exemptRoles: [],
        ...overrides,
    };
}
