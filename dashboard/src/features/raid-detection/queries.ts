import redis from "@/lib/redis";
import {
    cachedStatsSchema,
    raidDetectionConfigSchema,
    raidStatusSnapshotSchema,
    type RaidDetectionConfig,
    type RaidDetectionInput,
    type RaidStatusSnapshot,
} from "./types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getRaidDetectionConfig(guildId: string): Promise<RaidDetectionConfig> {
    const dbConfig = await getGuildConfigField<unknown>(guildId, "raid_detection");
    return raidDetectionConfigSchema.parse(dbConfig ?? {});
}

export async function saveRaidDetectionConfig(
    guildId: string,
    rawConfig: RaidDetectionInput
): Promise<RaidDetectionConfig> {
    const config = raidDetectionConfigSchema.parse(rawConfig);
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
    const joinsKey = `guild:${guildId}:recent_joins`;
    const statsCacheKey = `guild:${guildId}:stats_cache`;
    const activeKey = `raid_active:${guildId}`;

    const nowTs = Math.floor(Date.now() / 1000);
    const cutoff = nowTs - windowSizeSeconds;

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

    const windowMinutes = windowSizeSeconds / 60;
    const isRaidActive = Boolean(isActive);

    if (!rawStats) {
        return raidStatusSnapshotSchema.parse({
            currentJoinsInWindow,
            windowSizeSeconds,
            calculatedThreshold: minSafeLimit,
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
        windowSizeSeconds,
        calculatedThreshold: stats.threshold,
        avgJoinsPerMin: Math.round((stats.mean_window / windowMinutes) * 100) / 100,
        stdDevPerMin: Math.round((stats.std_dev_window / Math.sqrt(windowMinutes)) * 100) / 100,
        isRaidActive,
        statsAvailable: true,
    });
}