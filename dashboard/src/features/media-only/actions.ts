"use server";

import { revalidatePath } from "next/cache";
import redis from "@/lib/redis";
import { z } from "zod";

import { saveMediaOnlyChannels } from "./queries";
import { mediaOnlyChannelSchema, type MediaOnlyChannelInput } from "./types";
import { verifyGuildAccess } from "@/features/_shared/guild";

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
            throw new Error(error.issues[0]?.message || "Validation Error");
        }

        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}
