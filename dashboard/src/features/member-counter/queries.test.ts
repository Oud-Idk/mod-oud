import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    getMemberCounterConfig,
    saveMemberCounterConfig,
    setupMemberCounterChannels,
} from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

describe("Member Counter Query Module", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {});
        process.env = { ...originalEnv, BACKEND_INTERNAL_URL: "http://backend:8080" };
    });

    afterEach(() => {
        process.env = originalEnv;
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
            { id: "c1", channelId: null, counterType: "TOTAL_MEMBERS" as const, roleId: null, nameTemplate: "👥 {count}" },
        ];

        interface MockResponse {
            ok: boolean;
            json: () => Promise<unknown>;
            text: () => Promise<string>;
        }
        const mockFetchTyped = vi.hoisted(() =>
            vi.fn<(url: string, init?: RequestInit) => Promise<MockResponse>>()
        );

        beforeEach(() => {
            vi.stubGlobal("fetch", mockFetchTyped);
        });

        afterEach(() => {
            vi.unstubAllGlobals();
        });

        it("should POST the counters to the backend and return the JSON", async () => {
            const backendResponse = { success: true, counters: [{ id: "c1", channelId: "voice_1" }] };
            mockFetchTyped.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(backendResponse),
                text: () => Promise.resolve(""),
            });

            await expect(setupMemberCounterChannels("guild_123", counters)).resolves.toEqual(
                backendResponse
            );

            expect(mockFetchTyped).toHaveBeenCalledWith(
                "http://backend:8080/api/guilds/guild_123/member-counter/setup",
                expect.objectContaining({ method: "POST" })
            );
            const [, init] = mockFetchTyped.mock.calls[0];
            const bodyText = typeof init?.body === "string" ? init.body : "{}";
            expect(JSON.parse(bodyText)).toEqual({ counters });
        });

        it("should throw the backend error message on a non-OK response", async () => {
            mockFetchTyped.mockResolvedValue({
                ok: false,
                json: () => Promise.resolve({ message: "backend exploded" }),
                text: () => Promise.resolve(""),
            });

            await expect(setupMemberCounterChannels("guild_123", counters)).rejects.toThrow(
                "backend exploded"
            );
        });

        it("should throw a fallback when the backend returns an invalid error body", async () => {
            mockFetchTyped.mockResolvedValue({
                ok: false,
                json: () => Promise.reject(new Error("bad json")),
                text: () => Promise.resolve(""),
            });

            await expect(setupMemberCounterChannels("guild_123", counters)).rejects.toThrow(
                "Failed to create category and channels via bot backend."
            );
        });

        it("should propagate a network error", async () => {
            mockFetchTyped.mockRejectedValue(new Error("network down"));

            await expect(setupMemberCounterChannels("guild_123", counters)).rejects.toThrow(
                "network down"
            );
        });
    });
});
