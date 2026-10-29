import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getGuildDetails } from "./guild";
import type { DiscordGuildDetails } from "../types";

interface MockResponse {
    ok: boolean;
    json(): Promise<unknown>;
}

const mockFetch = vi.hoisted(() =>
    vi.fn<(url: string, init?: RequestInit) => Promise<MockResponse>>()
);

vi.stubGlobal("fetch", mockFetch);

describe("overview guild queries", () => {
    // Keep a snapshot of original env to prevent test pollution
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.restoreAllMocks();
    });

    describe("getGuildDetails", () => {
        const details: DiscordGuildDetails = {
            id: "guild_123",
            name: "Test Guild",
            icon: null,
            approximate_member_count: 42,
        };

        it("should return null when no DISCORD_TOKEN is set", async () => {
            delete process.env.DISCORD_TOKEN;

            const result = await getGuildDetails("guild_123");

            expect(result).toBeNull();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it("should return null when DISCORD_TOKEN is empty string", async () => {
            process.env.DISCORD_TOKEN = "";

            const result = await getGuildDetails("guild_123");

            expect(result).toBeNull();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it("should return null when DISCORD_TOKEN is whitespace only", async () => {
            process.env.DISCORD_TOKEN = "   ";

            const result = await getGuildDetails("guild_123");

            expect(result).toBeNull();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it("should fetch and return guild details on success", async () => {
            process.env.DISCORD_TOKEN = "token_123";
            mockFetch.mockResolvedValue({
                ok: true,
                json: () => Promise.resolve(details),
            });

            const result = await getGuildDetails("guild_123");

            expect(mockFetch).toHaveBeenCalledWith(
                "https://discord.com/api/v10/guilds/guild_123?with_counts=true",
                {
                    headers: { Authorization: "Bot token_123" },
                    next: { revalidate: 30 },
                }
            );
            expect(result).toEqual(details);
        });

        // 🟢 NEW: Tests Zod validation catching malformed Discord API payloads
        it("should return null when the Discord payload fails schema validation", async () => {
            process.env.DISCORD_TOKEN = "token_123";
            mockFetch.mockResolvedValue({
                ok: true,
                // Missing required "name" or wrong type
                json: () => Promise.resolve({ id: "guild_123" }),
            });

            const result = await getGuildDetails("guild_123");

            expect(result).toBeNull();
        });

        it("should return null when the API responds with an error", async () => {
            process.env.DISCORD_TOKEN = "token_123";
            const json = vi.fn<() => Promise<unknown>>().mockResolvedValue({});
            mockFetch.mockResolvedValue({
                ok: false,
                json,
            });

            const result = await getGuildDetails("guild_123");

            expect(result).toBeNull();
            // The error status returns before the body is read.
            expect(json).not.toHaveBeenCalled();
        });

        it("should return null when the fetch throws", async () => {
            process.env.DISCORD_TOKEN = "token_123";
            mockFetch.mockRejectedValue(new Error("network down"));

            const result = await getGuildDetails("guild_123");

            expect(result).toBeNull();
        });
    });
});
