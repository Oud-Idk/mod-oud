import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    getRaidDetectionConfig,
    saveRaidDetectionConfig,
    getRaidStatus,
} from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { RaidDetectionConfig } from "./types";

const mockRedisDel = vi.hoisted(() => vi.fn());
const mockRedisGet = vi.hoisted(() => vi.fn());
const mockRedisExists = vi.hoisted(() => vi.fn());
const mockRedisZremrangebyscore = vi.hoisted(() => vi.fn());
const mockRedisZcard = vi.hoisted(() => vi.fn());
const mockPipelineExec = vi.hoisted(() => vi.fn());
const mockRedisPipeline = vi.hoisted(() => vi.fn(() => ({
    zremrangebyscore: mockRedisZremrangebyscore,
    zcard: mockRedisZcard,
    exec: mockPipelineExec,
})));

vi.mock("@/lib/redis", () => ({
    default: {
        del: mockRedisDel,
        get: mockRedisGet,
        exists: mockRedisExists,
        pipeline: mockRedisPipeline,
    },
}));

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

describe("Raid Detection Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    function configFixture(overrides: Partial<RaidDetectionConfig> = {}): RaidDetectionConfig {
        return {
            enabled: false,
            zScoreMultiplier: 3,
            minSafeLimit: 5,
            windowSizeSeconds: 60,
            raidActions: [],
            ...overrides,
        };
    }

    describe("getRaidDetectionConfig", () => {
        it("should return default config when DB returns null", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getRaidDetectionConfig("guild_123");

            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "raid_detection");
            expect(result.enabled).toBe(false);
            expect(result.zScoreMultiplier).toBe(3);
            expect(result.raidActions).toEqual([]);
        });

        it("should merge partial saved DB config with Zod defaults", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({
                enabled: true,
                minSafeLimit: 10,
            });

            const result = await getRaidDetectionConfig("guild_123");

            expect(result.enabled).toBe(true);
            expect(result.minSafeLimit).toBe(10);
            expect(result.zScoreMultiplier).toBe(3);
            expect(result.windowSizeSeconds).toBe(60);
        });

        it("should propagate a database error from getGuildConfigField", async () => {
            vi.mocked(getGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(getRaidDetectionConfig("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveRaidDetectionConfig", () => {
        it("should save the config and invalidate the stats cache", async () => {
            const config = configFixture({ enabled: true });

            const result = await saveRaidDetectionConfig("guild_123", config);

            expect(saveGuildConfigField).toHaveBeenCalledWith("guild_123", "raid_detection", config);
            expect(mockRedisDel).toHaveBeenCalledWith("guild:guild_123:stats_cache");
            expect(result).toEqual(config);
        });

        it("should still save when Redis cache invalidation throws", async () => {
            mockRedisDel.mockRejectedValue(new Error("redis down"));

            const result = await saveRaidDetectionConfig("guild_123", configFixture());

            expect(result.enabled).toBe(false);
        });

        it("should propagate a database error from saveGuildConfigField", async () => {
            vi.mocked(saveGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(
                saveRaidDetectionConfig("guild_123", configFixture())
            ).rejects.toThrow("connection lost");
        });
    });

    describe("getRaidStatus", () => {
        it("should return a no-stats snapshot when no cached stats exist", async () => {
            mockPipelineExec.mockResolvedValue([[null, "OK"], [null, 7]]);
            mockRedisGet.mockResolvedValue(null);
            mockRedisExists.mockResolvedValue(0);

            const result = await getRaidStatus("guild_123", 60, 5);

            expect(mockRedisZremrangebyscore).toHaveBeenCalled();
            expect(mockRedisZcard).toHaveBeenCalled();
            expect(result.currentJoinsInWindow).toBe(7);
            expect(result.windowSizeSeconds).toBe(60);
            expect(result.calculatedThreshold).toBe(5);
            expect(result.avgJoinsPerMin).toBe(0);
            expect(result.statsAvailable).toBe(false);
            expect(result.isRaidActive).toBe(false);
        });

        it("should compute per-minute stats from cached stats", async () => {
            mockPipelineExec.mockResolvedValue([[null, "OK"], [null, 15]]);
            mockRedisGet.mockResolvedValue(
                JSON.stringify({ threshold: 20, mean_window: 10, std_dev_window: 3 })
            );
            mockRedisExists.mockResolvedValue(1);

            const result = await getRaidStatus("guild_123", 60, 5);

            expect(result.currentJoinsInWindow).toBe(15);
            expect(result.calculatedThreshold).toBe(20);
            expect(result.avgJoinsPerMin).toBe(10);
            expect(result.stdDevPerMin).toBe(3);
            expect(result.statsAvailable).toBe(true);
            expect(result.isRaidActive).toBe(true);
        });

        it("should mark the raid active based on the redis exists flag", async () => {
            mockPipelineExec.mockResolvedValue([[null, "OK"], [null, 0]]);
            mockRedisGet.mockResolvedValue(null);
            mockRedisExists.mockResolvedValue(1);

            const result = await getRaidStatus("guild_123", 60, 5);

            expect(result.isRaidActive).toBe(true);
            expect(result.statsAvailable).toBe(false);
        });

        it("should default currentJoinsInWindow to 0 when the pipeline result is not a number", async () => {
            mockPipelineExec.mockResolvedValue([[null, "OK"], [null, "banana"]]);
            mockRedisGet.mockResolvedValue(null);
            mockRedisExists.mockResolvedValue(0);

            const result = await getRaidStatus("guild_123", 60, 5);

            expect(result.currentJoinsInWindow).toBe(0);
        });

        it("should REJECT a non-positive windowSizeSeconds", async () => {
            await expect(getRaidStatus("guild_123", 0, 5)).rejects.toThrow();
        });

        it("should REJECT a non-positive minSafeLimit", async () => {
            await expect(getRaidStatus("guild_123", 60, 0)).rejects.toThrow();
        });
    });
});
