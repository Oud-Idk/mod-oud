"use server";

import { revalidatePath } from "next/cache";
import redis from "@/lib/redis";
import { z } from "zod";

import { saveMediaOnlyChannels } from "./queries";
import { mediaOnlyChannelSchema, type MediaOnlyChannelInput } from "./types";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { getGuildChannels } from "@/features/_shared/channels";

function mediaCacheKey(channelId: string): string {
    return `media_channel:${channelId}`;
}

export async function saveMediaOnlyChannelsAction(
    guildId: string,
    rawChannels: MediaOnlyChannelInput[],
    removedChannelIds: string[]
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);

        const channels = rawChannels.map((c) => mediaOnlyChannelSchema.parse(c));

        // The bot enforces these rules by channel ID alone, so a foreign ID would let this
        // guild's manager delete messages in a channel they cannot manage.
        const guildChannelIds = new Set(
            (await getGuildChannels(guildId)).map((channel) => channel.id)
        );
        if (guildChannelIds.size === 0) {
            // The lookup returns an empty list on failure, so an empty set proves nothing.
            throw new Error("Could not read this server's channels. Try again.");
        }
        for (const channelId of [
            ...channels.map((c) => c.channelId),
            ...removedChannelIds,
        ]) {
            if (!guildChannelIds.has(channelId)) {
                throw new Error("Those channels do not belong to this server.");
            }
        }

        const affectedIds = [...channels.map((c) => c.channelId), ...removedChannelIds];

        await saveMediaOnlyChannels(guildId, channels, removedChannelIds);

        try {
            await redis.del(affectedIds.map(mediaCacheKey));
        } catch (redisError) {
            console.error("Failed to clear media-only Redis cache:", redisError);
        }

        revalidatePath(`/dashboard/${guildId}/media-only`);
    } catch (error) {
        console.error("Failed to save media-only channels:", error);

        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }

        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}
