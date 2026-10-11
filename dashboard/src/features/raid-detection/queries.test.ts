import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    getRaidDetectionConfig,
    saveRaidDetectionConfig,
    getRaidStatus,
} from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { RaidDetectionConfig } from "./types";

const mockRedisDel = vi.hoisted(() => vi.fn());
const mockBackendFetch = vi.hoisted(() => vi.fn());

vi.mock("@/lib/redis", () => ({
    default: {
        del: mockRedisDel,
    },
}));

vi.mock("@/lib/backend", () => ({
    backendFetch: mockBackendFetch,
}));

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

/** Mirrors the Rust `RaidStatsSnapshot` the bot returns from the stats endpoint. */
function statsPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        currentJoinsInWindow: 0,
        windowSizeSeconds: 60,
        calculatedThreshold: 5,
        avgJoinsPerMin: 0,
        avgJoinsPerDay: 2.57,
        stdDevPerMin: 0.04,
        isRaidActive: false,
        statsAvailable: true,
        ...overrides,
    };
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

describe("Raid Detection Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {return});
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
        it("should return the stats the bot reports", async () => {
            mockBackendFetch.mockResolvedValue(
                jsonResponse(statsPayload({ currentJoinsInWindow: 3, calculatedThreshold: 12 }))
            );

            const result = await getRaidStatus("guild_123");

            expect(mockBackendFetch).toHaveBeenCalledWith(
                "/api/guilds/guild_123/raid-detection/stats",
                { method: "GET" }
            );
            expect(result.currentJoinsInWindow).toBe(3);
            expect(result.calculatedThreshold).toBe(12);
            expect(result.avgJoinsPerDay).toBe(2.57);
            expect(result.statsAvailable).toBe(true);
        });

        it("should surface an uncalibrated guild as having no stats", async () => {
            mockBackendFetch.mockResolvedValue(
                jsonResponse(
                    statsPayload({
                        calculatedThreshold: 5,
                        avgJoinsPerMin: 0,
                        avgJoinsPerDay: 0,
                        stdDevPerMin: 0,
                        statsAvailable: false,
                    })
                )
            );

            const result = await getRaidStatus("guild_123");

            expect(result.statsAvailable).toBe(false);
            expect(result.calculatedThreshold).toBe(5);
            expect(result.avgJoinsPerDay).toBe(0);
        });

        it("should surface an active raid", async () => {
            mockBackendFetch.mockResolvedValue(
                jsonResponse(statsPayload({ isRaidActive: true }))
            );

            const result = await getRaidStatus("guild_123");

            expect(result.isRaidActive).toBe(true);
        });

        it("should not echo a 5xx body back at the user", async () => {
            mockBackendFetch.mockResolvedValue(jsonResponse({ error: "boom" }, 500));

            await expect(getRaidStatus("guild_123")).rejects.toThrow(
                "Could not read raid detection status."
            );
        });

        it("should pass a 4xx body through", async () => {
            mockBackendFetch.mockResolvedValue(jsonResponse({ error: "nope" }, 400));

            await expect(getRaidStatus("guild_123")).rejects.toThrow();
        });

        it("should REJECT a payload the bot should not be sending", async () => {
            mockBackendFetch.mockResolvedValue(
                jsonResponse(statsPayload({ avgJoinsPerDay: "2.57" }))
            );

            await expect(getRaidStatus("guild_123")).rejects.toThrow();
        });

        it("should REJECT an empty guild id", async () => {
            await expect(getRaidStatus("")).rejects.toThrow();
        });
    });
});
