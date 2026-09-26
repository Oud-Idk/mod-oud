"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { verifyGuildAccess } from "@/features/_shared/guild";
import { FEED_DELIVERY, pollIntervalMinutes } from "@/features/rss/delivery";
import {
    addFeedSubscription,
    removeFeedSubscription,
    type SubscribeFeedResult,
} from "@/features/rss/queries";
import { subscribeRssInputSchema } from "@/features/rss/types";

/// Turns the bot's response into a message the toast can show verbatim.
function summarizeSubscription(result: SubscribeFeedResult): string {
    if (result.alreadySubscribed) {
        return "This channel is already subscribed to that feed.";
    }

    switch (result.delivery) {
        case FEED_DELIVERY.POLLING:
            return `Subscribed to "${result.feedTitle}" — new posts are polled every ${String(pollIntervalMinutes(result.intervalSecs))} minutes.`;

        case FEED_DELIVERY.PUBSUBHUBBUB:
            return result.hubConfirmed
                ? `Subscribed to "${result.feedTitle}" via WebSub.`
                : `Subscribed to "${result.feedTitle}", but the WebSub hub returned an error — polling fallback may be required.`;
    }
}

export async function addFeedSubscriptionAction(guildId: string, rawData: unknown): Promise<string> {
    try {
        await verifyGuildAccess(guildId);

        const input = subscribeRssInputSchema.parse(rawData);
        const result = await addFeedSubscription(guildId, input);

        revalidatePath(`/dashboard/${guildId}/rss`);
        return summarizeSubscription(result);
    } catch (error) {
        console.error("Failed to subscribe to feed:", error);

        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }

        throw new Error(error instanceof Error ? error.message : "Could not subscribe to that feed.");
    }
}

const removeFeedInputSchema = z.object({
    feedId: z.uuid("Invalid feed ID"),
    channelId: z.string().min(1, "Invalid channel ID"),
});

export async function removeFeedSubscriptionAction(
    guildId: string,
    feedId: string,
    channelId: string
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);

        const { feedId: validFeedId, channelId: validChannelId } = removeFeedInputSchema.parse({
            feedId,
            channelId,
        });

        const removed = await removeFeedSubscription(guildId, validFeedId, validChannelId);

        revalidatePath(`/dashboard/${guildId}/rss`);

        if (!removed) {
            throw new Error("That subscription no longer exists.");
        }
    } catch (error) {
        console.error("Failed to remove feed subscription:", error);

        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }

        throw new Error(error instanceof Error ? error.message : "Could not remove that subscription.");
    }
}
