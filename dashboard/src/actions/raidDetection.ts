"use server";

import redis from "@/utils/init/redis";

export type RaidStatusSnapshot = {
    currentJoinsInWindow: number;
    windowSizeSeconds: number;
    calculatedThreshold: number;
    avgJoinsPerMin: number;
    stdDevPerMin: number;
    isRaidActive: boolean;
    statsAvailable: boolean;
};

type CachedStats = {
    threshold: number;
    mean_window: number;
    std_dev_window: number;
};

export async function getRaidStatus(
    guildId: string,
    windowSizeSeconds: number,
    minSafeLimit: number,
): Promise<RaidStatusSnapshot> {
    const joinsKey = `guild:${guildId}:recent_joins`;
    const statsCacheKey = `guild:${guildId}:stats_cache`;
    const activeKey = `raid_active:${guildId}`;

    const nowTs = Math.floor(Date.now() / 1000);
    const cutoff = nowTs - windowSizeSeconds;

    // Non-mutating-ish peek: trims expired entries + counts, mirrors cache::peek_joins_in_window
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(joinsKey, "-inf", cutoff);
    pipeline.zcard(joinsKey);
    const pipelineResults = await pipeline.exec();

    const currentJoinsInWindow = (pipelineResults?.[1]?.[1] as number) ?? 0;

    const [rawStats, isActive] = await Promise.all([
        redis.get(statsCacheKey),
        redis.exists(activeKey),
    ]);

    const windowMinutes = windowSizeSeconds / 60;

    if (!rawStats) {
        return {
            currentJoinsInWindow,
            windowSizeSeconds,
            calculatedThreshold: minSafeLimit,
            avgJoinsPerMin: 0,
            stdDevPerMin: 0,
            isRaidActive: Boolean(isActive),
            statsAvailable: false,
        };
    }

    const stats: CachedStats = JSON.parse(rawStats);

    return {
        currentJoinsInWindow,
        windowSizeSeconds,
        calculatedThreshold: stats.threshold,
        avgJoinsPerMin: Math.round((stats.mean_window / windowMinutes) * 100) / 100,
        stdDevPerMin: Math.round((stats.std_dev_window / Math.sqrt(windowMinutes)) * 100) / 100,
        isRaidActive: Boolean(isActive),
        statsAvailable: true,
    };
}