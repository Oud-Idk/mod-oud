import { describe, it, expect, vi, beforeEach } from "vitest";
import { getMediaOnlyChannels, saveMediaOnlyChannels } from "./queries";
import type { MediaOnlyChannel } from "./types";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>()
);

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
    },
}));

describe("Media-Only Query Module", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getMediaOnlyChannels", () => {
        it("should map DB rows to the MediaOnlyChannel shape", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        channelId: "chan_1",
                        guildId: "guild_123",
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
                        exemptRoles: null,
                    },
                ],
            });

            const result = await getMediaOnlyChannels("guild_123");

            const [queryStr, params = []] = mockQuery.mock.calls[0];
            expect(queryStr).toContain("FROM media_only_channels");
            expect(params).toEqual(["guild_123"]);
            expect(result).toHaveLength(1);
            expect(result[0].channelId).toBe("chan_1");
            expect(result[0].exemptRoles).toEqual([]);
        });

        it("should return an empty list when there are no rows", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            const result = await getMediaOnlyChannels("guild_123");

            expect(result).toEqual([]);
        });
    });

    describe("saveMediaOnlyChannels", () => {
        it("should run a single batched upsert for all channels", async () => {
            const channels = [
                channelFixture({ channelId: "chan_1" }),
                channelFixture({ channelId: "chan_2", allowAudio: true }),
            ];
            mockQuery.mockResolvedValue({ rows: [] });

            await saveMediaOnlyChannels("guild_123", channels, []);

            expect(mockQuery).toHaveBeenCalledTimes(1);

            const [queryStr, params = []] = mockQuery.mock.calls[0];
            expect(queryStr).toContain("ON CONFLICT (channel_id)");
            expect(queryStr).toContain("UNNEST");
            expect(params).toEqual([
                ["chan_1", "chan_2"],
                ["guild_123", "guild_123"],
                [true, true],
                [true, true],
                [true, true],
                [false, true],
                [true, true],
                [true, true],
                [true, true],
                [false, false],
                ["Discussion - {user}", "Discussion - {user}"],
                [5, 5],
                [[], []],
            ]);
        });

        it("should delete removed channels with a single batched DELETE", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await saveMediaOnlyChannels("guild_123", [], ["chan_removed"]);

            const [queryStr, params = []] = mockQuery.mock.calls[0];
            expect(queryStr).toContain("DELETE FROM media_only_channels");
            expect(queryStr).toContain("= ANY($2::BIGINT[])");
            expect(params).toEqual(["guild_123", ["chan_removed"]]);
        });

        it("should upsert channels and delete removed channels together", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await saveMediaOnlyChannels("guild_123", [channelFixture()], ["chan_removed"]);

            expect(mockQuery).toHaveBeenCalledTimes(2);
            expect(mockQuery.mock.calls[0][0]).toContain("INSERT INTO media_only_channels");
            expect(mockQuery.mock.calls[1][0]).toContain("DELETE FROM media_only_channels");
        });

        it("should run no queries when both lists are empty", async () => {
            await saveMediaOnlyChannels("guild_123", [], []);

            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(
                saveMediaOnlyChannels("guild_123", [channelFixture()], [])
            ).rejects.toThrow("connection lost");
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
