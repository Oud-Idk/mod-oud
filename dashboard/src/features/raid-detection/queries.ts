import { z } from "zod";
import redis from "@/lib/redis";
import {
    cachedStatsSchema,
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

export async function getRaidStatus(
    guildId: string,
    windowSizeSeconds: number,
    minSafeLimit: number
): Promise<RaidStatusSnapshot> {
    const validGuildId = z.string().min(1).parse(guildId);
    const validWindowSizeSeconds = z.number().int().positive().parse(windowSizeSeconds);
    const validMinSafeLimit = z.number().int().positive().parse(minSafeLimit);

    const joinsKey = `guild:${validGuildId}:recent_joins`;
    const statsCacheKey = `guild:${validGuildId}:stats_cache`;
    const activeKey = `raid_active:${validGuildId}`;

    const nowTs = Math.floor(Date.now() / 1000);
    const cutoff = nowTs - validWindowSizeSeconds;

    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(joinsKey, "-inf", cutoff);
    pipeline.zcard(joinsKey);
    const pipelineResults = await pipeline.exec();

    // Safely extract numeric results without type assertions
    const secondResult = pipelineResults?.[1]?.[1];
    const currentJoinsInWindow = typeof secondResult === "number" ? secondResult : 0;

    const [rawStats, isActive] = await Promise.all([
        redis.get(statsCacheKey),
        redis.exists(activeKey),
    ]);

    const windowMinutes = validWindowSizeSeconds / 60;
    const isRaidActive = Boolean(isActive);

    if (rawStats === null) {
        return raidStatusSnapshotSchema.parse({
            currentJoinsInWindow,
            windowSizeSeconds: validWindowSizeSeconds,
            calculatedThreshold: validMinSafeLimit,
            avgJoinsPerMin: 0,
            stdDevPerMin: 0,
            isRaidActive,
            statsAvailable: false,
        });
    }

    // Parse raw stats through Zod validation boundary
    const stats = cachedStatsSchema.parse(JSON.parse(rawStats));

    return raidStatusSnapshotSchema.parse({
        currentJoinsInWindow,
        windowSizeSeconds: validWindowSizeSeconds,
        calculatedThreshold: stats.threshold,
        avgJoinsPerMin: Math.round((stats.mean_window / windowMinutes) * 100) / 100,
        stdDevPerMin: Math.round((stats.std_dev_window / Math.sqrt(windowMinutes)) * 100) / 100,
        isRaidActive,
        statsAvailable: true,
    });
}