import { z } from "zod";
import redis from "@/lib/redis";
import { backendFetch } from "@/lib/backend";
import {
    raidDetectionConfigSchema,
    raidStatusSnapshotSchema,
    type RaidDetectionConfig,
    type RaidStatusSnapshot,
} from "./types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getRaidDetectionConfig(guildId: string): Promise<RaidDetectionConfig> {
    const validGuildId = z.string().min(1).parse(guildId);
    const dbConfig = await getGuildConfigField(validGuildId, "raid_detection");
    return raidDetectionConfigSchema.parse(dbConfig ?? {});
}

export async function saveRaidDetectionConfig(
    guildId: string,
    config: RaidDetectionConfig
): Promise<RaidDetectionConfig> {
    await saveGuildConfigField(guildId, "raid_detection", config);

    const statsCacheKey = `guild:${guildId}:stats_cache`;
    try {
        await redis.del(statsCacheKey);
    } catch (err) {
        console.error("Failed to invalidate raid stats cache", err);
    }

    return config;
}

/**
 * Current raid traffic and threshold.
 *
 * The bot owns this calculation: it enforces the threshold, so the dashboard asks rather
 * than reimplementing the formula. Recomputing here produced numbers that silently
 * disagreed with the enforced ones once the bot's short-lived stats cache expired.
 */
export async function getRaidStatus(guildId: string): Promise<RaidStatusSnapshot> {
    const validGuildId = z.string().min(1).parse(guildId);

    const response = await backendFetch(`/api/guilds/${validGuildId}/raid-detection/stats`, {
        method: "GET",
    });

    if (!response.ok) {
        // The bot's 5xx body describes its own internals, so do not echo it at the user.
        if (response.status >= 500) {
            throw new Error("Could not read raid detection status.");
        }

        const detail = (await response.text()).trim();
        throw new Error(detail === "" ? "Could not read raid detection status." : detail);
    }

    return raidStatusSnapshotSchema.parse(await response.json());
}

