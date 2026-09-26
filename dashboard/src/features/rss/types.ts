import { z } from "zod";

/// How a feed delivers new posts — mirrors the bot's `FEED_TYPE` Postgres enum.
export const feedDeliverySchema = z.enum(["PUBSUBHUBBUB", "POLLING"]);
export type FeedDelivery = z.infer<typeof feedDeliverySchema>;

const isoDateSchema = z.coerce.date().transform((date: Date) => date.toISOString());

/// One row of "this guild's channel is subscribed to this feed".
export const rssFeedSubscriptionSchema = z.object({
    feedId: z.uuid("Invalid feed ID"),
    url: z.string().min(1, "Feed URL is required"),
    channelId: z.string().min(1, "Channel ID is required"),
    delivery: feedDeliverySchema,
    hubUrl: z.string().nullish(),
    topic: z.string().nullish(),
    leaseExpiresAt: isoDateSchema.nullish(),
    intervalSecs: z.number().int().nullish(),
    lastPolledAt: isoDateSchema.nullish(),
});
export type RssFeedSubscription = z.infer<typeof rssFeedSubscriptionSchema>;

/// Input for subscribing a channel to a feed.
///
/// `channelId` is honestly `null` while nothing has been picked yet — `""` is
/// never a stand-in for "unselected". The transform narrows the nullish input
/// back to a required `string` on the way out, so the save boundary is strict
/// without every caller having to re-check for the missing channel.
export const subscribeRssInputSchema = z.object({
    url: z
        .string({ error: "Please enter a feed URL" })
        .trim()
        .min(1, "Please enter a feed URL")
        .max(2048, "That feed URL is too long")
        .regex(/^https?:\/\//i, "Feed URL must start with http:// or https://"),
    channelId: z.string().nullish().transform((channelId, ctx) => {
        if (channelId === null || channelId === undefined || channelId === "") {
            // Field-level transform: the issue path is already scoped to `channelId`.
            ctx.addIssue({
                code: "custom",
                message: "Please select a channel",
            });

            return z.NEVER;
        }

        return channelId;
    }),
});
export type SubscribeRssInput = z.infer<typeof subscribeRssInputSchema>;
