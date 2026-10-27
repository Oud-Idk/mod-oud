import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveMediaOnlyChannelsAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveMediaOnlyChannels } from "./queries";
import redis from "@/lib/redis";
import { revalidatePath } from "next/cache";
import { getGuildChannels } from "@/features/_shared/channels";
import type { MediaOnlyChannel } from "./types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/_shared/channels", () => ({
    getGuildChannels: vi.fn<() => Promise<{ id: string }[]>>(),
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
        // Default: the guild owns the channels the fixtures use.
        vi.mocked(getGuildChannels).mockResolvedValue([
            { id: "chan_1" },
            { id: "chan_removed" },
        ]);
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
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("I didn't write this test for Spicy, it's just code coverage"));

            await expect(
                saveMediaOnlyChannelsAction("guild_123", [channelFixture()], [])
            ).rejects.toThrow(new Error("I didn't write this test for Spicy, it's just code coverage"));

            expect(saveMediaOnlyChannels).not.toHaveBeenCalled();
            expect(redis.del).not.toHaveBeenCalled();
        });

        it("should REJECT a channel with a missing channelId", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await expect(
                saveMediaOnlyChannelsAction("guild_123", [
                    { ...channelFixture(), channelId: "" },
                ], [])
            ).rejects.toThrow(new Error("Please select a channel."));

            expect(saveMediaOnlyChannels).not.toHaveBeenCalled();
        });

        it("should REJECT a channel that belongs to another guild", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(getGuildChannels).mockResolvedValue([{ id: "chan_other" }]);

            await expect(
                saveMediaOnlyChannelsAction("guild_123", [channelFixture({ channelId: "chan_foreign" })], [])
            ).rejects.toThrow(new Error("Those channels do not belong to this server."));

            expect(saveMediaOnlyChannels).not.toHaveBeenCalled();
            expect(redis.del).not.toHaveBeenCalled();
        });

        it("should REJECT a removed channel that belongs to another guild", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await expect(
                saveMediaOnlyChannelsAction("guild_123", [], ["chan_foreign"])
            ).rejects.toThrow(new Error("Those channels do not belong to this server."));

            expect(saveMediaOnlyChannels).not.toHaveBeenCalled();
        });

        it("should refuse to save when the channel lookup returns nothing", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            // getGuildChannels returns an empty list on failure, so this must not pass silently.
            vi.mocked(getGuildChannels).mockResolvedValue([]);

            await expect(
                saveMediaOnlyChannelsAction("guild_123", [channelFixture()], [])
            ).rejects.toThrow(new Error("Could not read this server's channels. Try again."));

            expect(saveMediaOnlyChannels).not.toHaveBeenCalled();
        });

        it("should throw the fallback message when the failure is not an Error", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveMediaOnlyChannels).mockRejectedValue("boom");

            await expect(
                saveMediaOnlyChannelsAction("guild_123", [channelFixture()], [])
            ).rejects.toThrow(new Error("Could not save configuration."));
        });

        it("should not fail the save when Redis del throws", async (): Promise<void> => {
            const redisError = new Error("Redis down");
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveMediaOnlyChannels).mockResolvedValue(undefined);
            vi.mocked(redis.del).mockRejectedValue(redisError);

            await saveMediaOnlyChannelsAction("guild_123", [channelFixture()], []);

            expect(saveMediaOnlyChannels).toHaveBeenCalled();
            expect(revalidatePath).toHaveBeenCalled();
        });

        it("should propagate a DB error from saveMediaOnlyChannels", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveMediaOnlyChannels).mockRejectedValue(new Error("spicy left me on read for 4 minutes and 12 seconds"));

            await expect(
                saveMediaOnlyChannelsAction("guild_123", [channelFixture()], [])
            ).rejects.toThrow(new Error("spicy left me on read for 4 minutes and 12 seconds"));
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
