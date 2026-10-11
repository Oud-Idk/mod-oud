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

// Mirrors HISTORY_HOURS in src/features/raid_detection/constants.rs.
const HISTORY_HOURS = 168;

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
    minSafeLimit: number,
    zScoreMultiplier: number
): Promise<RaidStatusSnapshot> {
    const validGuildId = z.string().min(1).parse(guildId);
    const validWindowSizeSeconds = z.number().int().positive().parse(windowSizeSeconds);
    const validMinSafeLimit = z.number().int().positive().parse(minSafeLimit);
    const validZScoreMultiplier = z.number().positive().parse(zScoreMultiplier);

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

    // The bot writes `stats_cache` on a join and lets it expire after 15 minutes, so on any
    // server quieter than that it is usually absent. Rebuild from the hourly history instead,
    // which is the same input the bot derives its own numbers from. Only a genuinely missing
    // history means there is no baseline to show.
    if (rawStats === null) {
        const history = await loadHourlyHistory(validGuildId);
        const hasHistory = history.some((count) => count > 0);

        if (hasHistory) {
            const stats = calculateThreshold({
                history,
                zScoreMultiplier: validZScoreMultiplier,
                minSafeLimit: validMinSafeLimit,
                windowSizeSeconds: validWindowSizeSeconds,
            });

            return raidStatusSnapshotSchema.parse({
                currentJoinsInWindow,
                windowSizeSeconds: validWindowSizeSeconds,
                calculatedThreshold: stats.threshold,
                avgJoinsPerMin: round2(stats.meanWindow / windowMinutes),
                avgJoinsPerDay: round2(joinsPerDay(stats.meanWindow, validWindowSizeSeconds)),
                stdDevPerMin: round2(stats.stdDevWindow / Math.sqrt(windowMinutes)),
                isRaidActive,
                statsAvailable: true,
            });
        }

        return raidStatusSnapshotSchema.parse({
            currentJoinsInWindow,
            windowSizeSeconds: validWindowSizeSeconds,
            calculatedThreshold: validMinSafeLimit,
            avgJoinsPerMin: 0,
            avgJoinsPerDay: 0,
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
        avgJoinsPerMin: round2(stats.mean_window / windowMinutes),
        avgJoinsPerDay: round2(joinsPerDay(stats.mean_window, validWindowSizeSeconds)),
        stdDevPerMin: round2(stats.std_dev_window / Math.sqrt(windowMinutes)),
        isRaidActive,
        statsAvailable: true,
    });
}

/**
 * Reads the bot's hourly join counts, zero-filled across the whole history window so that
 * quiet hours count as observed zero traffic rather than as missing data.
 *
 * Mirrors `get_history_from_cache` in src/features/raid_detection/cache.rs.
 */
async function loadHourlyHistory(guildId: string): Promise<number[]> {
    const fields: string[] = [];
    for (let hoursAgo = 1; hoursAgo <= HISTORY_HOURS; hoursAgo++) {
        fields.push(formatHourKey(new Date(Date.now() - hoursAgo * 3_600_000)));
    }

    const raw = await redis.hmget(`guild:${guildId}:hourly_stats`, ...fields);

    return raw.map((value) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : 0;
    });
}

/**
 * Port of the bot's `calculate_threshold` in
 * src/features/raid_detection/implementation.rs. The bot runs this itself whenever it
 * takes the stats lock; this only rebuilds the dashboard's copy from history. The bot
 * stays the authority on the threshold it enforces.
 */
function calculateThreshold({
    history,
    zScoreMultiplier,
    minSafeLimit,
    windowSizeSeconds,
}: {
    history: number[];
    zScoreMultiplier: number;
    minSafeLimit: number;
    windowSizeSeconds: number;
}): { threshold: number; meanWindow: number; stdDevWindow: number } {
    const n = history.length;
    const meanHour = history.reduce((sum, value) => sum + value, 0) / n;
    const variance =
        history.reduce((sum, value) => sum + (value - meanHour) ** 2, 0) / Math.max(n - 1, 1);
    const stdDevHour = Math.sqrt(variance);

    const scale = windowSizeSeconds / 3600;
    const meanWindow = meanHour * scale;
    const stdDevWindow = stdDevHour * Math.sqrt(scale);

    const dynamicThreshold = zScoreMultiplier * stdDevWindow + meanWindow;

    return {
        threshold: Math.max(Math.ceil(dynamicThreshold), minSafeLimit),
        meanWindow,
        stdDevWindow,
    };
}

/** Matches the bot's `%Y%m%d%H` hour bucketing. */
function formatHourKey(at: Date): string {
    const year = String(at.getUTCFullYear());
    const month = String(at.getUTCMonth() + 1).padStart(2, "0");
    const day = String(at.getUTCDate()).padStart(2, "0");
    const hour = String(at.getUTCHours()).padStart(2, "0");
    return `${year}${month}${day}${hour}`;
}

const SECONDS_PER_DAY = 86_400;

/**
 * Restates a per-window mean as a per-day rate. `meanWindow` is the expected join count
 * across `windowSizeSeconds`, so scaling it to a full day keeps this consistent with
 * `avgJoinsPerMin` whichever detection window the guild configured.
 */
function joinsPerDay(meanWindow: number, windowSizeSeconds: number): number {
    return (meanWindow / windowSizeSeconds) * SECONDS_PER_DAY;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}