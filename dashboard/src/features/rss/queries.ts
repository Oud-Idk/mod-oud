import { db } from "@/lib/db";
import { backendFetch } from "@/lib/backend";
import { z } from "zod";
import {
    feedDeliverySchema,
    rssFeedSubscriptionSchema,
    type RssFeedSubscription,
    type SubscribeRssInput,
} from "./types";

/**
 * Every feed this guild has a channel subscribed to.
 *
 * Feeds themselves are global (deduplicated by URL); the per-guild state lives
 * in `channel_subscriptions`, so a guild's list is a plain join.
 */
export async function getFeedSubscriptions(guildId: string): Promise<RssFeedSubscription[]> {
    const validGuildId = z.string().min(1).parse(guildId);

    const query = `
        SELECT f.id               AS "feedId",
               f.url              AS "url",
               f.feed_type::TEXT  AS "delivery",
               f.hub_url          AS "hubUrl",
               f.topic            AS "topic",
               f.lease_expires_at AS "leaseExpiresAt",
               f.interval_secs    AS "intervalSecs",
               f.last_polled_at   AS "lastPolledAt",
               cs.channel_id      AS "channelId"
        FROM channel_subscriptions cs
        JOIN feeds f ON f.id = cs.feed_id
        WHERE cs.guild_id = $1
        ORDER BY cs.created_at DESC;
    `;

    const res = await db.query(query, [validGuildId]);

    return res.rows.map((row) => rssFeedSubscriptionSchema.parse(row));
}

/**
 * Unsubscribes one channel from one feed.
 *
 * The feed row is left alone on purpose — feeds are shared across guilds and
 * the WebSub lease dies on its own once nobody is listening.
 */
export async function removeFeedSubscription(
    guildId: string,
    feedId: string,
    channelId: string
): Promise<boolean> {
    const res = await db.query(
        `DELETE FROM channel_subscriptions
         WHERE feed_id = $1 AND channel_id = $2 AND guild_id = $3`,
        [feedId, channelId, guildId]
    );

    return (res.rowCount ?? 0) > 0;
}

/// Bot response for a created feed subscription.
const subscribeFeedResponseSchema = z.object({
    feedId: z.string().min(1),
    feedTitle: z.string().min(1),
    alreadySubscribed: z.boolean(),
    delivery: feedDeliverySchema,
    hubConfirmed: z.boolean(),
    intervalSecs: z.number().int().nullish(),
});

export type SubscribeFeedResult = z.infer<typeof subscribeFeedResponseSchema>;

/**
 * Asks the bot to fetch, parse, and subscribe to a feed.
 *
 * This is the one part of RSS management that cannot touch the DB directly:
 * feed parsing, hub discovery, and the WebSub handshake all live in Rust.
 */
export async function addFeedSubscription(
    guildId: string,
    input: SubscribeRssInput
): Promise<SubscribeFeedResult> {
    const res = await backendFetch(`/api/guilds/${guildId}/rss/feeds`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            url: input.url,
            channelId: input.channelId,
        }),
    });

    if (!res.ok) {
        const errorText = (await res.text()).trim();
        throw new Error(errorText !== "" ? errorText : "Rust backend request failed.");
    }

    return subscribeFeedResponseSchema.parse(await res.json());
}
