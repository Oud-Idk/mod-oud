import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    getMemberCounterConfig,
    saveMemberCounterConfig,
    setupMemberCounterChannels,
} from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { backendFetch } from "@/lib/backend";

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

vi.mock("@/lib/backend", () => ({
    backendFetch: vi.fn(),
}));

// DB round-trips live behind getGuildConfigField/saveGuildConfigField, which
// the shared guild module owns. What stays here is the backend HTTP contract:
// method, headers, body, and error mapping.

// Real Responses so .ok, .text() and .json() behave as against the bot.
function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

function errorResponse(status: number, body: string): Response {
    return new Response(body, { status });
}

describe("Member Counter Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => { return });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getMemberCounterConfig", () => {
        it("should return default config when DB returns null", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getMemberCounterConfig("guild_123");

            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "member_counter");
            expect(result.enabled).toBe(false);
            expect(result.updateIntervalMinutes).toBe(15);
            expect(result.counters).toEqual([]);
        });

        it("should merge partial saved DB config with Zod defaults", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({
                enabled: true,
                updateIntervalMinutes: 5,
            });

            const result = await getMemberCounterConfig("guild_123");

            expect(result.enabled).toBe(true);
            expect(result.updateIntervalMinutes).toBe(5);
            expect(result.counters).toEqual([]);
        });

        it("should propagate a database error from getGuildConfigField", async () => {
            vi.mocked(getGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(getMemberCounterConfig("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveMemberCounterConfig", () => {
        it("should save the config and return it", async () => {
            const config = {
                enabled: true,
                updateIntervalMinutes: 5,
                counters: [],
            };

            const result = await saveMemberCounterConfig("guild_123", config);

            expect(saveGuildConfigField).toHaveBeenCalledWith("guild_123", "member_counter", config);
            expect(result).toEqual(config);
        });

        it("should propagate a database error from saveGuildConfigField", async () => {
            vi.mocked(saveGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(
                saveMemberCounterConfig("guild_123", {
                    enabled: false,
                    updateIntervalMinutes: 15,
                    counters: [],
                })
            ).rejects.toThrow("connection lost");
        });
    });

    describe("setupMemberCounterChannels", () => {
        const counters = [
            { id: "c1", channelId: null, counterType: "BOTS_ONLY" as const, roleId: null, nameTemplate: "👥 {count}" },
        ];

        it("should POST the counters to the backend and return the JSON", async () => {
            const backendResponse = {
                counters: [
                    {
                        id: "c1",
                        channelId: "voice_1",
                        counterType: "BOTS_ONLY",
                        roleId: null,
                        nameTemplate: "👥 {count}"
                    }
                ]
            };

            vi.mocked(backendFetch).mockResolvedValue(jsonResponse(backendResponse));

            await expect(setupMemberCounterChannels("guild_123", counters)).resolves.toEqual(
                backendResponse
            );
            expect(backendFetch).toHaveBeenCalledWith(
                "/api/guilds/guild_123/member-counter/setup",
                expect.objectContaining({ method: "POST" })
            );
            const [, init] = vi.mocked(backendFetch).mock.calls[0];
            // backendFetch fills a missing Content-Type itself, so assert the
            // call args to prove the header is sent explicitly.
            expect(init?.headers).toEqual({ "Content-Type": "application/json" });
            const bodyText = typeof init?.body === "string" ? init.body : "{}";
            expect(JSON.parse(bodyText)).toEqual({ counters });
        });

        it("should throw the backend error message on a non-OK response", async () => {
            vi.mocked(backendFetch).mockResolvedValue(errorResponse(400, "i hate thespicywolf"));

            await expect(setupMemberCounterChannels("guild_123", counters)).rejects.toThrow(
                new Error("i hate thespicywolf")
            );
        });

        it("should trim a padded backend error message", async () => {
            vi.mocked(backendFetch).mockResolvedValue(errorResponse(400, "  backend exploded  \n"));

            await expect(setupMemberCounterChannels("guild_123", counters)).rejects.toThrow(
                new Error("backend exploded")
            );
        });

        it("should fall back to a generic message when the backend error body is empty", async () => {
            vi.mocked(backendFetch).mockResolvedValue(errorResponse(500, ""));

            await expect(setupMemberCounterChannels("guild_123", counters)).rejects.toThrow(
                new Error("Failed to create category and channels via bot backend.")
            );
        });

        it("should fall back to a generic message when the backend error body is blank", async () => {
            vi.mocked(backendFetch).mockResolvedValue(errorResponse(500, "   \n  "));

            await expect(setupMemberCounterChannels("guild_123", counters)).rejects.toThrow(
                new Error("Failed to create category and channels via bot backend.")
            );
        });

        it("should propagate a network error", async () => {
            vi.mocked(backendFetch).mockRejectedValue(new Error("network down"));

            await expect(setupMemberCounterChannels("guild_123", counters)).rejects.toThrow(
                new Error("network down")
            );
        });
    });
});
