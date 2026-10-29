import { describe, expect, it, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { getGuildFeatureMatrix } from "@/features/overview";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const HOST_USER = "111111111111111111";

async function cleanupGuild(guildId: string): Promise<void> {
    await db.query(`DELETE FROM guild_configs WHERE guild_id = $1::bigint`, [guildId]);
    await db.query(`DELETE FROM custom_commands WHERE guild_id = $1::bigint`, [guildId]);
    await db.query(`DELETE FROM starboards WHERE guild_id = $1::bigint`, [guildId]);
    await db.query(`DELETE FROM reaction_messages WHERE guild_id = $1::bigint`, [guildId]);
    await db.query(`DELETE FROM reminders WHERE guild_id = $1::bigint`, [guildId]);
    await db.query(`DELETE FROM media_only_channels WHERE guild_id = $1::bigint`, [guildId]);
    await db.query(`DELETE FROM temp_voice_hubs WHERE guild_id = $1::bigint`, [guildId]);
    await db.query(`DELETE FROM giveaways WHERE guild_id = $1::bigint`, [guildId]);
    await db.query(`DELETE FROM channel_subscriptions WHERE guild_id = $1::bigint`, [guildId]);
}

async function seedGuildConfig(guildId: string, settings: Record<string, unknown>): Promise<void> {
    await db.query(
        `INSERT INTO guild_configs (guild_id, settings)
         VALUES ($1::bigint, $2::jsonb)
         ON CONFLICT (guild_id) DO UPDATE SET settings = EXCLUDED.settings`,
        [guildId, JSON.stringify(settings)]
    );
}

async function seedCustomCommand(guildId: string, name: string): Promise<void> {
    await db.query(
        `INSERT INTO custom_commands (guild_id, name)
         VALUES ($1::bigint, $2)
         ON CONFLICT (guild_id, name) DO NOTHING`,
        [guildId, name]
    );
}

async function seedStarboard(guildId: string, channelId: string): Promise<void> {
    await db.query(
        `INSERT INTO starboards (guild_id, starboard_channel_id)
         VALUES ($1::bigint, $2::bigint)`,
        [guildId, channelId]
    );
}

async function seedReactionMessage(guildId: string, channelId: string, name: string): Promise<void> {
    await db.query(
        `INSERT INTO reaction_messages (guild_id, channel_id, name)
         VALUES ($1::bigint, $2::bigint, $3)`,
        [guildId, channelId, name]
    );
}

async function seedReminder(guildId: string, channelId: string): Promise<void> {
    await db.query(
        `INSERT INTO reminders (guild_id, channel_id, next_trigger_at)
         VALUES ($1::bigint, $2::bigint, NOW() + INTERVAL '1 day')`,
        [guildId, channelId]
    );
}

async function seedMediaOnlyChannel(guildId: string, channelId: string): Promise<void> {
    await db.query(
        `INSERT INTO media_only_channels (guild_id, channel_id)
         VALUES ($1::bigint, $2::bigint)
         ON CONFLICT (channel_id) DO NOTHING`,
        [guildId, channelId]
    );
}

async function seedTempVoiceHub(guildId: string, hubChannelId: string, categoryId: string): Promise<void> {
    await db.query(
        `INSERT INTO temp_voice_hubs (guild_id, hub_channel_id, category_id)
         VALUES ($1::bigint, $2::bigint, $3::bigint)`,
        [guildId, hubChannelId, categoryId]
    );
}

async function seedGiveaway(guildId: string, prize: string): Promise<void> {
    await db.query(
        `INSERT INTO giveaways (guild_id, host_id, prize, end_time)
         VALUES ($1::bigint, $2::bigint, $3, NOW() + INTERVAL '1 day')`,
        [guildId, HOST_USER, prize]
    );
}

async function seedRssSubscription(guildId: string, channelId: string, url: string): Promise<void> {
    const feedRes = await db.query<{ id: string }>(
        `INSERT INTO feeds (url, feed_type, interval_secs)
         VALUES ($1, 'POLLING', 600)
         ON CONFLICT (url) DO UPDATE SET url = EXCLUDED.url
         RETURNING id`,
        [url]
    );
    const feedId = feedRes.rows[0]?.id;

    await db.query(
        `INSERT INTO channel_subscriptions (feed_id, channel_id, guild_id)
         VALUES ($1::uuid, $2::bigint, $3::bigint)
         ON CONFLICT (feed_id, channel_id) DO NOTHING`,
        [feedId, channelId, guildId]
    );
}

describe("feature matrix against real database", () => {
    beforeEach(async () => {
        await cleanupGuild(GUILD_A);
        await cleanupGuild(GUILD_B);
    });

    it("returns empty/default categories when guild has no records", async () => {
        const matrix = await getGuildFeatureMatrix(GUILD_A);

        expect(Array.isArray(matrix)).toBe(true);
        expect(matrix.length).toBeGreaterThan(0);
    });

    it("counts features accurately and enforces strict guild isolation", async () => {
        // Seed 2 custom commands, 1 starboard, 1 reminder, 1 media-only channel for GUILD_A
        await seedCustomCommand(GUILD_A, "cmd_1");
        await seedCustomCommand(GUILD_A, "cmd_2");
        await seedStarboard(GUILD_A, "200000000000000001");
        await seedReminder(GUILD_A, "200000000000000002");
        await seedMediaOnlyChannel(GUILD_A, "200000000000000003");

        // Seed 1 custom command and 2 starboards for GUILD_B
        await seedCustomCommand(GUILD_B, "cmd_b1");
        await seedStarboard(GUILD_B, "200000000000000004");
        await seedStarboard(GUILD_B, "200000000000000005");

        const matrixA = await getGuildFeatureMatrix(GUILD_A);
        const matrixB = await getGuildFeatureMatrix(GUILD_B);

        // Flatten features from all categories
        const featuresA = matrixA.flatMap((category) => category.features);
        const featuresB = matrixB.flatMap((category) => category.features);

        // Guild A assertions
        const customCmdsA = featuresA.find((f) => f.id === "custom-commands");
        const starboardsA = featuresA.find((f) => f.id === "starboard");
        const remindersA = featuresA.find((f) => f.id === "reminders");
        const mediaOnlyA = featuresA.find((f) => f.id === "media-only");

        expect(customCmdsA?.enabled).toBe(true);
        expect(customCmdsA?.description).toBe("2 commands");

        expect(starboardsA?.enabled).toBe(true);
        expect(starboardsA?.description).toBe("1 board active");

        expect(remindersA?.enabled).toBe(true);
        expect(remindersA?.description).toBe("1 reminder");

        expect(mediaOnlyA?.enabled).toBe(true);
        expect(mediaOnlyA?.description).toBe("1 channel");

        // Guild B assertions (verify isolation: counts didn't leak from Guild A)
        const customCmdsB = featuresB.find((f) => f.id === "custom-commands");
        const starboardsB = featuresB.find((f) => f.id === "starboard");
        const remindersB = featuresB.find((f) => f.id === "reminders");

        expect(customCmdsB?.enabled).toBe(true);
        expect(customCmdsB?.description).toBe("1 command");

        expect(starboardsB?.enabled).toBe(true);
        expect(starboardsB?.description).toBe("2 boards active");

        expect(remindersB?.enabled).toBe(false); // Guild B has no reminders
    });

    it("reads and parses complex JSONB settings and subscriptions without crashing", async () => {
        await seedGuildConfig(GUILD_A, {
            message_filtering: {
                invites: { enabled: true },
                links: { enabled: true },
            },
            tickets: {
                channel_id: "555555555555555555",
            },
            leveling: {
                enabled: true,
            },
            moderation_dms: {
                warn: { enabled: true },
            },
        });

        await seedReactionMessage(GUILD_A, "200000000000000010", "Roles Panel");
        await seedTempVoiceHub(GUILD_A, "200000000000000020", "200000000000000021");
        await seedGiveaway(GUILD_A, "Discord Nitro");
        await seedRssSubscription(GUILD_A, "200000000000000030", "https://example.com/rss.xml");

        const matrix = await getGuildFeatureMatrix(GUILD_A);

        expect(Array.isArray(matrix)).toBe(true);
        expect(matrix.length).toBeGreaterThan(0);
    });
});