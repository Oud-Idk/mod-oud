import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getFeedSubscriptions, removeFeedSubscription } from "./queries";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const CHANNEL_1 = "111111111111111111";
const CHANNEL_2 = "222222222222222222";
const CHANNEL_3 = "333333333333333333";

async function seedPollingFeed(url: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
        `INSERT INTO feeds (url, feed_type, interval_secs)
         VALUES ($1, 'POLLING'::FEED_TYPE, 600)
         RETURNING id`,
        [url]
    );
    return rows[0].id;
}

async function seedHubFeed(url: string): Promise<string> {
    const { rows } = await db.query<{ id: string }>(
        `INSERT INTO feeds (url, feed_type, hub_url, topic, interval_secs, lease_expires_at, last_polled_at)
         VALUES ($1, 'PUBSUBHUBBUB'::FEED_TYPE, 'https://hub.example', 'https://example.com/topic', NULL, '2026-02-01T00:00:00Z'::timestamptz, '2026-01-15T00:00:00Z'::timestamptz)
         RETURNING id`,
        [url]
    );
    return rows[0].id;
}

async function seedSubscription(
    guildId: string,
    feedId: string,
    channelId: string,
    createdAt: string = new Date().toISOString()
): Promise<void> {
    await db.query(
        `INSERT INTO channel_subscriptions (feed_id, channel_id, guild_id, created_at)
         VALUES ($1::uuid, $2::bigint, $3::bigint, $4::timestamptz)`,
        [feedId, channelId, guildId, createdAt]
    );
}

describe("rss subscriptions against a real database", () => {
    it("returns an empty array for a guild with no subscriptions", async () => {
        expect(await getFeedSubscriptions(GUILD_A)).toEqual([]);
    });

    it("maps a polling feed with its subscription channel", async () => {
        const feedId = await seedPollingFeed("https://example.com/feed.xml");
        await seedSubscription(GUILD_A, feedId, CHANNEL_1);

        const [sub] = await getFeedSubscriptions(GUILD_A);

        expect(sub.feedId).toBe(feedId);
        expect(sub.url).toBe("https://example.com/feed.xml");
        expect(sub.delivery).toBe("POLLING");
        expect(sub.hubUrl).toBeNull();
        expect(sub.topic).toBeNull();
        expect(sub.leaseExpiresAt).toBeNull();
        expect(sub.intervalSecs).toBe(600);
        expect(typeof sub.intervalSecs).toBe("number");
        expect(sub.lastPolledAt).toBeNull();
        expect(sub.channelId).toBe(CHANNEL_1);
    });

    it("maps a websub feed with its hub fields", async () => {
        const feedId = await seedHubFeed("https://example.com/hub.xml");
        await seedSubscription(GUILD_A, feedId, CHANNEL_1);

        const [sub] = await getFeedSubscriptions(GUILD_A);

        expect(sub.delivery).toBe("PUBSUBHUBBUB");
        expect(sub.hubUrl).toBe("https://hub.example");
        expect(sub.topic).toBe("https://example.com/topic");
        expect(sub.leaseExpiresAt).toEqual(new Date("2026-02-01T00:00:00.000Z"));
        expect(sub.intervalSecs).toBeNull();
        expect(sub.lastPolledAt).toEqual(new Date("2026-01-15T00:00:00.000Z"));
    });

    it("scopes subscriptions to the guild", async () => {
        const feedId = await seedPollingFeed("https://example.com/feed.xml");
        await seedSubscription(GUILD_A, feedId, CHANNEL_1);
        await seedSubscription(GUILD_B, feedId, CHANNEL_2);

        expect(await getFeedSubscriptions(GUILD_A)).toHaveLength(1);
        expect(await getFeedSubscriptions(GUILD_B)).toHaveLength(1);
    });

    it("lists one row per subscribed channel", async () => {
        const feedId = await seedPollingFeed("https://example.com/feed.xml");
        await seedSubscription(GUILD_A, feedId, CHANNEL_1);
        await seedSubscription(GUILD_A, feedId, CHANNEL_2);

        const subs = await getFeedSubscriptions(GUILD_A);

        expect(subs).toHaveLength(2);
        expect(subs.every((s) => s.feedId === feedId)).toBe(true);
    });

    it("orders by subscription date descending", async () => {
        const feedId = await seedPollingFeed("https://example.com/feed.xml");
        await seedSubscription(GUILD_A, feedId, CHANNEL_1, "2026-01-01T00:00:00Z");
        await seedSubscription(GUILD_A, feedId, CHANNEL_2, "2026-01-03T00:00:00Z");
        await seedSubscription(GUILD_A, feedId, CHANNEL_3, "2026-01-02T00:00:00Z");

        const subs = await getFeedSubscriptions(GUILD_A);

        expect(subs.map((s) => s.channelId)).toEqual([CHANNEL_2, CHANNEL_3, CHANNEL_1]);
    });

    it("removes subscriptions with their feed row via cascade", async () => {
        // The FK cascades, so the subscription row is gone, not merely
        // hidden by the inner JOIN. Orphan rows cannot exist to tell the
        // JOIN type apart, which makes the cascade the invariant to pin.
        const feedId = await seedPollingFeed("https://example.com/feed.xml");
        await seedSubscription(GUILD_A, feedId, CHANNEL_1);

        await db.query("DELETE FROM feeds WHERE id = $1::uuid", [feedId]);

        const { rowCount } = await db.query(
            "SELECT 1 FROM channel_subscriptions WHERE feed_id = $1::uuid",
            [feedId]
        );
        expect(rowCount).toBe(0);
        expect(await getFeedSubscriptions(GUILD_A)).toEqual([]);
    });

    it("rejects a subscription to a missing feed", async () => {
        await expect(
            seedSubscription(GUILD_A, "11111111-1111-4111-8111-111111111111", CHANNEL_1)
        ).rejects.toThrow(/channel_subscriptions_feed_id_fkey/);
    });

    it("rejects a duplicate feed url", async () => {
        await seedPollingFeed("https://example.com/feed.xml");

        await expect(seedPollingFeed("https://example.com/feed.xml")).rejects.toThrow(
            /feeds_url_key/
        );
    });

    it("deletes the subscription and reports success", async () => {
        const feedId = await seedPollingFeed("https://example.com/feed.xml");
        await seedSubscription(GUILD_A, feedId, CHANNEL_1);

        expect(await removeFeedSubscription(GUILD_A, feedId, CHANNEL_1)).toBe(true);
        expect(await getFeedSubscriptions(GUILD_A)).toEqual([]);
    });

    it("refuses to delete another guild's subscription", async () => {
        const feedId = await seedPollingFeed("https://example.com/feed.xml");
        await seedSubscription(GUILD_B, feedId, CHANNEL_1);

        expect(await removeFeedSubscription(GUILD_A, feedId, CHANNEL_1)).toBe(false);
        expect(await getFeedSubscriptions(GUILD_B)).toHaveLength(1);
    });

    it("reports false for a missing subscription", async () => {
        expect(
            await removeFeedSubscription(
                GUILD_A,
                "11111111-1111-4111-8111-111111111111",
                CHANNEL_1
            )
        ).toBe(false);
    });
});
