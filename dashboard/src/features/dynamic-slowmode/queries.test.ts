import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getDynamicSlowmodeConfig, saveDynamicSlowmodeConfig, getSlowmodeStatus } from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { backendFetch } from "@/lib/backend";

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

vi.mock("@/lib/backend", () => ({
    backendFetch: vi.fn(),
}));

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

function errorResponse(body: string, status: number): Response {
    return new Response(body, { status });
}

const STATUS_BODY = {
    config: {
        enabled: true,
        channels: ["chan_1"],
        ceilingSecs: 300,
        authorThresholds: [4, 6, 9, 13, 18, 24, 30, 40],
        volumeThresholds: [16, 26, 38, 56, 78, 104, 130, 170],
        windowSecs: 60,
    },
    channels: [
        {
            channelId: "chan_1",
            preAutomationSecs: 0,
            lastWrittenSecs: 15,
            authors: 9,
            volume: 38,
            armed: true,
            status: "Automating",
        },
    ],
};

describe("Dynamic Slowmode Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getDynamicSlowmodeConfig", () => {
        it("should return defaults when the DB has no config", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getDynamicSlowmodeConfig("guild_123");

            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "dynamic_slowmode");
            expect(result.enabled).toBe(false);
            expect(result.channels).toEqual([]);
            expect(result.ceilingSecs).toBe(300);
        });

        it("should merge a partial saved config with defaults", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({
                enabled: true,
                channels: ["chan_1"],
            });

            const result = await getDynamicSlowmodeConfig("guild_123");

            expect(result.enabled).toBe(true);
            expect(result.channels).toEqual(["chan_1"]);
            expect(result.windowSecs).toBe(60);
        });

        it("should propagate a database error", async () => {
            vi.mocked(getGuildConfigField).mockRejectedValue(new Error("db down"));

            await expect(getDynamicSlowmodeConfig("guild_123")).rejects.toThrow(new Error("db down"));
        });
    });

    describe("saveDynamicSlowmodeConfig", () => {
        it("should save under the dynamic_slowmode key", async () => {
            const config = {
                enabled: true,
                channels: ["chan_1"],
                ceilingSecs: 120,
                authorThresholds: [4, 6, 9, 13, 18, 24, 30, 40],
                volumeThresholds: [16, 26, 38, 56, 78, 104, 130, 170],
                windowSecs: 60,
            };

            const result = await saveDynamicSlowmodeConfig("guild_123", config);

            expect(saveGuildConfigField).toHaveBeenCalledWith(
                "guild_123",
                "dynamic_slowmode",
                config
            );
            expect(result).toEqual(config);
        });

        it("should propagate a database error", async () => {
            vi.mocked(saveGuildConfigField).mockRejectedValue(new Error("write failed"));

            await expect(
                saveDynamicSlowmodeConfig("guild_123", {
                    enabled: false,
                    channels: [],
                    ceilingSecs: 300,
                    authorThresholds: [4, 6, 9, 13, 18, 24, 30, 40],
                    volumeThresholds: [16, 26, 38, 56, 78, 104, 130, 170],
                    windowSecs: 60,
                })
            ).rejects.toThrow(new Error("write failed"));
        });
    });

    describe("getSlowmodeStatus", () => {
        it("should parse the bot's status response", async () => {
            vi.mocked(backendFetch).mockResolvedValue(jsonResponse(STATUS_BODY));

            const result = await getSlowmodeStatus("guild_123");

            expect(backendFetch).toHaveBeenCalledWith("/api/guilds/guild_123/slowmode/status", {
                method: "GET",
            });
            expect(result.channels).toHaveLength(1);
            expect(result.channels[0].lastWrittenSecs).toBe(15);
            expect(result.channels[0].armed).toBe(true);
        });

        it("should hide the bot's 5xx detail from the user", async () => {
            vi.mocked(backendFetch).mockResolvedValue(
                errorResponse("postgres connection refused at 10.0.0.5", 500)
            );

            await expect(getSlowmodeStatus("guild_123")).rejects.toThrow(
                new Error("Could not read dynamic slowmode status.")
            );
        });

        it("should surface a 4xx detail", async () => {
            vi.mocked(backendFetch).mockResolvedValue(errorResponse("guild not found", 404));

            await expect(getSlowmodeStatus("guild_123")).rejects.toThrow(
                new Error("guild not found")
            );
        });

        it("should fall back to a generic message on an empty 4xx body", async () => {
            vi.mocked(backendFetch).mockResolvedValue(errorResponse("   ", 404));

            await expect(getSlowmodeStatus("guild_123")).rejects.toThrow(
                new Error("Could not read dynamic slowmode status.")
            );
        });

        it("should reject a response that does not match the schema", async () => {
            vi.mocked(backendFetch).mockResolvedValue(
                jsonResponse({ config: {}, channels: "not-an-array" })
            );

            await expect(getSlowmodeStatus("guild_123")).rejects.toThrow();
        });
    });
});
