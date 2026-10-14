import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getMediaOnlyChannels, saveMediaOnlyChannels } from "./queries";
import type { MediaOnlyChannel } from "./types";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const CHANNEL_A = "111111111111111111";
const CHANNEL_B = "222222222222222222";
const ROLE_1 = "333333333333333333";
const ROLE_2 = "444444444444444444";

function channelFixture(overrides: Partial<MediaOnlyChannel> = {}): MediaOnlyChannel {
    return {
        channelId: CHANNEL_A,
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

describe("media-only channels against a real database", () => {
    it("returns an empty array for a guild with no channels", async () => {
        expect(await getMediaOnlyChannels(GUILD_A)).toEqual([]);
    });

    it("round-trips a saved channel", async () => {
        await saveMediaOnlyChannels(GUILD_A, [channelFixture()], []);

        const [channel] = await getMediaOnlyChannels(GUILD_A);

        expect(channel.channelId).toBe(CHANNEL_A);
        expect(channel.enabled).toBe(true);
        expect(channel.allowImages).toBe(true);
        expect(channel.allowVideos).toBe(true);
        expect(channel.allowAudio).toBe(false);
        expect(channel.allowGif).toBe(true);
        expect(channel.allowLinks).toBe(true);
        expect(channel.allowEmbeddedText).toBe(true);
        expect(channel.autoThread).toBe(false);
        expect(channel.threadNameTemplate).toBe("Discussion - {user}");
        expect(channel.deleteWarningAfterSecs).toBe(5);
        expect(channel.exemptRoles).toEqual([]);
    });

    it("orders channels by channel_id", async () => {
        await saveMediaOnlyChannels(GUILD_A, [
            channelFixture({ channelId: CHANNEL_B }),
            channelFixture({ channelId: CHANNEL_A }),
        ], []);

        expect((await getMediaOnlyChannels(GUILD_A)).map((c) => c.channelId)).toEqual([
            CHANNEL_A,
            CHANNEL_B,
        ]);
    });

    it("keeps one guild's channels out of another's", async () => {
        await saveMediaOnlyChannels(GUILD_A, [channelFixture({ channelId: CHANNEL_A })], []);
        await saveMediaOnlyChannels(GUILD_B, [channelFixture({ channelId: CHANNEL_B })], []);

        expect((await getMediaOnlyChannels(GUILD_A)).map((c) => c.channelId)).toEqual([CHANNEL_A]);
        expect((await getMediaOnlyChannels(GUILD_B)).map((c) => c.channelId)).toEqual([CHANNEL_B]);
    });

    it("upserts on channel_id and updates the stored fields", async () => {
        await saveMediaOnlyChannels(GUILD_A, [channelFixture({ enabled: true })], []);

        await saveMediaOnlyChannels(GUILD_A, [channelFixture({ enabled: false, allowAudio: true })], []);

        const rows = await getMediaOnlyChannels(GUILD_A);

        expect(rows).toHaveLength(1);
        expect(rows[0].enabled).toBe(false);
        expect(rows[0].allowAudio).toBe(true);
    });

    it("round-trips exempt roles as strings", async () => {
        await saveMediaOnlyChannels(
            GUILD_A,
            [channelFixture({ exemptRoles: [ROLE_1, ROLE_2] })],
            []
        );

        expect((await getMediaOnlyChannels(GUILD_A))[0].exemptRoles).toEqual([ROLE_1, ROLE_2]);
    });

    it("coalesces a NULL exempt_roles array to an empty array", async () => {
        await db.query(
            `INSERT INTO media_only_channels (channel_id, guild_id, exempt_roles)
             VALUES ($1::bigint, $2::bigint, NULL)`,
            [CHANNEL_A, GUILD_A]
        );

        expect((await getMediaOnlyChannels(GUILD_A))[0].exemptRoles).toEqual([]);
    });

    it("round-trips a null thread name template", async () => {
        await saveMediaOnlyChannels(
            GUILD_A,
            [channelFixture({ threadNameTemplate: null })],
            []
        );

        expect((await getMediaOnlyChannels(GUILD_A))[0].threadNameTemplate).toBeNull();
    });

    it("deletes only the requested removed channels in the guild", async () => {
        await saveMediaOnlyChannels(GUILD_A, [channelFixture({ channelId: CHANNEL_A })], []);
        await saveMediaOnlyChannels(GUILD_A, [channelFixture({ channelId: CHANNEL_B })], []);
        await saveMediaOnlyChannels(GUILD_B, [channelFixture({ channelId: "999999999999999999" })], []);

        await saveMediaOnlyChannels(GUILD_A, [], [CHANNEL_A, "999999999999999999"]);

        expect((await getMediaOnlyChannels(GUILD_A)).map((c) => c.channelId)).toEqual([CHANNEL_B]);
        expect(await getMediaOnlyChannels(GUILD_B)).toHaveLength(1);
    });

    it("treats an empty save and empty removal as a no-op", async () => {
        await saveMediaOnlyChannels(GUILD_A, [channelFixture()], []);

        await saveMediaOnlyChannels(GUILD_A, [], []);

        expect(await getMediaOnlyChannels(GUILD_A)).toHaveLength(1);
    });

    it("rejects a non-numeric channel id", async () => {
        await expect(
            saveMediaOnlyChannels(GUILD_A, [channelFixture({ channelId: "not-a-number" })], [])
        ).rejects.toThrow();
    });

    it("rejects a non-numeric exempt role id", async () => {
        await expect(
            saveMediaOnlyChannels(
                GUILD_A,
                [channelFixture({ exemptRoles: ["not-a-number"] })],
                []
            )
        ).rejects.toThrow();
    });
});
