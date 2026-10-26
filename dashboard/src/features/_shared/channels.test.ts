import { beforeEach, describe, expect, it, vi } from "vitest";
import redis from "@/lib/redis";
import { revalidateTag } from "next/cache";
import {
    getGuildChannels,
    getGuildRoles,
    getTextChannelMap,
    getVoiceChannelMap,
    getRoleMap,
    getCategoryMap,
    getSlowmodeChannelMap,
    invalidateGuildChannelCache,
} from "./channels";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
    revalidateTag: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
    default: {
        get: vi.fn<(key: string) => Promise<unknown>>(),
        set: vi.fn<(key: string, value: string, mode: string, duration: number) => Promise<unknown>>(),
        del: vi.fn<(keys: string[]) => Promise<unknown>>(),
    },
}));

function jsonResponse(data: unknown, status = 200): Response {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}

const GUILD_ID = "guild_123";

beforeEach(() => {
    vi.clearAllMocks();
    process.env.DISCORD_TOKEN = "mock_bot_token";
    vi.spyOn(console, "error").mockImplementation(() => { return });
});

describe("getGuildChannels", () => {
    it("fetches channels and only returns text (0) and announcement (5) channels", async () => {
        const mockChannels = [
            { id: "c1", name: "general", type: 0 },
            { id: "c2", name: "voice-lounge", type: 2 },
            { id: "c3", name: "announcements", type: 5 },
            { id: "c4", name: "categories", type: 4 },
        ];

        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(mockChannels));

        const result = await getGuildChannels(GUILD_ID);

        expect(globalThis.fetch).toHaveBeenCalledWith(
            `https://discord.com/api/v10/guilds/${GUILD_ID}/channels`,
            {
                headers: { Authorization: "Bot mock_bot_token" },
                next: { revalidate: 30 },
            }
        );
        expect(result).toEqual([
            { id: "c1", name: "general", type: 0 },
            { id: "c3", name: "announcements", type: 5 },
        ]);
    });

    it.each([undefined, ""])("returns empty array when DISCORD_TOKEN is '%s'", async (token) => {
        if (token === undefined) {
            delete process.env.DISCORD_TOKEN;
        } else {
            process.env.DISCORD_TOKEN = token;
        }
        globalThis.fetch = vi.fn();

        const result = await getGuildChannels(GUILD_ID);

        expect(result).toEqual([]);
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledWith(
            "DISCORD_TOKEN is missing in environment variables."
        );
    });

    it("returns empty array and logs specific error message when API responds with error", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ message: "Forbidden" }, 403));

        const result = await getGuildChannels(GUILD_ID);

        expect(result).toEqual([]);
        expect(console.error).toHaveBeenCalledWith(
            `Failed to fetch channels for guild ${GUILD_ID}:`,
            expect.objectContaining({
                message: "Discord API responded with status 403",
            })
        );
    });

    it("returns an empty array when fetch network fails", async () => {
        globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network connection lost"));

        const result = await getGuildChannels(GUILD_ID);

        expect(result).toEqual([]);
        expect(console.error).toHaveBeenCalled();
    });
});

describe("getGuildRoles", () => {
    it("fetches roles with correct headers and filters out @everyone and managed roles", async () => {
        const mockRoles = [
            { id: GUILD_ID, name: "@everyone", managed: false },
            { id: "r1", name: "Moderator", managed: false },
            { id: "r2", name: "Bot Role", managed: true },
            { id: "r3", name: "Member", managed: false },
        ];

        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(mockRoles));

        const result = await getGuildRoles(GUILD_ID);

        expect(globalThis.fetch).toHaveBeenCalledWith(
            `https://discord.com/api/v10/guilds/${GUILD_ID}/roles`,
            {
                headers: { Authorization: "Bot mock_bot_token" },
                next: { revalidate: 30 },
            }
        );
        expect(result).toEqual([
            { id: "r1", name: "Moderator", managed: false },
            { id: "r3", name: "Member", managed: false },
        ]);
    });

    it.each([undefined, ""])("returns empty array when DISCORD_TOKEN is '%s'", async (token) => {
        if (token === undefined) {
            delete process.env.DISCORD_TOKEN;
        } else {
            process.env.DISCORD_TOKEN = token;
        }
        globalThis.fetch = vi.fn();

        const result = await getGuildRoles(GUILD_ID);

        expect(result).toEqual([]);
        expect(globalThis.fetch).not.toHaveBeenCalled();
        expect(console.error).toHaveBeenCalledWith(
            "DISCORD_TOKEN is missing in environment variables."
        );
    });

    it("returns empty array and logs error when roles API responds with error status", async () => {
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ message: "Forbidden" }, 403));

        const result = await getGuildRoles(GUILD_ID);

        expect(result).toEqual([]);
        expect(console.error).toHaveBeenCalledWith(
            `Failed to fetch roles for guild ${GUILD_ID}:`,
            expect.objectContaining({
                message: "Discord API responded with status 403",
            })
        );
    });
});

describe("getGuildResourceMap (Cache-aside behavior)", () => {
    it("returns cached data on a Redis cache hit without calling fetch", async () => {
        const cachedMap = { c1: "general", c2: "updates" };
        vi.mocked(redis.get).mockResolvedValue(JSON.stringify(cachedMap));
        globalThis.fetch = vi.fn();

        const result = await getTextChannelMap(GUILD_ID);

        expect(redis.get).toHaveBeenCalledWith(`guild:${GUILD_ID}:channels`);
        expect(result).toEqual(cachedMap);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("handles an already-parsed object returned from Redis", async () => {
        const cachedMap = { c1: "general" };
        // @ts-expect-error Testing defensive runtime fallback for non-string cache values
        vi.mocked(redis.get).mockResolvedValue(cachedMap);
        globalThis.fetch = vi.fn();

        const result = await getTextChannelMap(GUILD_ID);

        expect(result).toEqual(cachedMap);
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("ignores corrupted cache data that fails schema validation and proceeds to fetch", async () => {
        vi.mocked(redis.get).mockResolvedValue(JSON.stringify(["not", "a", "record", "map"]));
        const mockChannels = [{ id: "c1", name: "general", type: 0 }];
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(mockChannels));

        const result = await getTextChannelMap(GUILD_ID);

        expect(result).toEqual({ c1: "general" });
        expect(globalThis.fetch).toHaveBeenCalled();
    });

    it("proceeds to fetch when Redis returns an empty string without logging an error", async () => {
        vi.mocked(redis.get).mockResolvedValue("");
        const mockChannels = [{ id: "c1", name: "general", type: 0 }];
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(mockChannels));

        const result = await getTextChannelMap(GUILD_ID);

        expect(result).toEqual({ c1: "general" });
        expect(console.error).not.toHaveBeenCalled();
        expect(globalThis.fetch).toHaveBeenCalled();
    });

    it("fetches from Discord API on a cache miss with exact tags and writes to Redis", async () => {
        vi.mocked(redis.get).mockResolvedValue(null);

        const mockChannels = [
            { id: "c1", name: "general", type: 0 },
            { id: "c2", name: "voice", type: 2 },
            { id: "c3", name: "category", type: 4 },
            { id: "c4", name: "stage", type: 13 },
            { id: "c5", name: "announcements", type: 5 },
        ];
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(mockChannels));

        const result = await getTextChannelMap(GUILD_ID);

        expect(globalThis.fetch).toHaveBeenCalledWith(
            `https://discord.com/api/v10/guilds/${GUILD_ID}/channels`,
            {
                headers: { Authorization: "Bot mock_bot_token" },
                next: {
                    revalidate: 300,
                    tags: [`guild-channels-${GUILD_ID}`],
                },
            }
        );
        expect(result).toEqual({ c1: "general", c5: "announcements" });
        expect(redis.set).toHaveBeenCalledWith(
            `guild:${GUILD_ID}:channels`,
            JSON.stringify({ c1: "general", c5: "announcements" }),
            "EX",
            300
        );
    });

    it.each([undefined, ""])("returns empty object when token is '%s' on cache miss", async (token) => {
        vi.mocked(redis.get).mockResolvedValue(null);
        if (token === undefined) {
            delete process.env.DISCORD_TOKEN;
        } else {
            process.env.DISCORD_TOKEN = token;
        }
        globalThis.fetch = vi.fn();

        const result = await getTextChannelMap(GUILD_ID);

        expect(result).toEqual({});
        expect(globalThis.fetch).not.toHaveBeenCalled();
    });

    it("returns empty object and logs when Discord API returns an error status", async () => {
        vi.mocked(redis.get).mockResolvedValue(null);
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse({ message: "Rate limited" }, 429));

        const result = await getTextChannelMap(GUILD_ID);

        expect(result).toEqual({});
        expect(console.error).toHaveBeenCalledWith(
            "Failed to fetch channels from Discord API:",
            expect.objectContaining({
                message: "Discord API returned status 429",
            })
        );
    });

    it("gracefully falls back to fetch if Redis read fails", async () => {
        vi.mocked(redis.get).mockRejectedValue(new Error("Redis offline"));

        const mockChannels = [{ id: "c1", name: "general", type: 0 }];
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(mockChannels));

        const result = await getTextChannelMap(GUILD_ID);

        expect(result).toEqual({ c1: "general" });
        expect(console.error).toHaveBeenCalled();
    });

    it("still returns the resource map if Redis write fails", async () => {
        vi.mocked(redis.get).mockResolvedValue(null);
        vi.mocked(redis.set).mockRejectedValue(new Error("Redis read-only replica"));

        const mockChannels = [{ id: "c1", name: "general", type: 0 }];
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(mockChannels));

        const result = await getTextChannelMap(GUILD_ID);

        expect(result).toEqual({ c1: "general" });
        expect(console.error).toHaveBeenCalled();
    });
});

describe("Resource map specific filters and endpoints", () => {
    beforeEach(() => {
        vi.mocked(redis.get).mockResolvedValue(null);
    });

    it("uses correct endpoint and filters voice channels (type 2) in getVoiceChannelMap", async () => {
        const mockChannels = [
            { id: "v1", name: "Lounge", type: 2 },
            { id: "c1", name: "text", type: 0 },
        ];
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(mockChannels));

        const result = await getVoiceChannelMap(GUILD_ID);

        expect(redis.get).toHaveBeenCalledWith(`guild:${GUILD_ID}:voice-channels`);
        expect(globalThis.fetch).toHaveBeenCalledWith(
            `https://discord.com/api/v10/guilds/${GUILD_ID}/channels`,
            expect.anything()
        );
        expect(result).toEqual({ v1: "Lounge" });
    });

    it("uses correct endpoint and filters categories (type 4) in getCategoryMap", async () => {
        const mockChannels = [
            { id: "cat1", name: "Text Channels", type: 4 },
            { id: "c1", name: "general", type: 0 },
        ];
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(mockChannels));

        const result = await getCategoryMap(GUILD_ID);

        expect(redis.get).toHaveBeenCalledWith(`guild:${GUILD_ID}:categories`);
        expect(globalThis.fetch).toHaveBeenCalledWith(
            `https://discord.com/api/v10/guilds/${GUILD_ID}/channels`,
            expect.anything()
        );
        expect(result).toEqual({ cat1: "Text Channels" });
    });

    it("uses correct endpoint and maps all roles in getRoleMap", async () => {
        const mockRoles = [
            { id: "r1", name: "Admin" },
            { id: "r2", name: "Member" },
        ];
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(mockRoles));

        const result = await getRoleMap(GUILD_ID);

        expect(redis.get).toHaveBeenCalledWith(`guild:${GUILD_ID}:roles`);
        expect(globalThis.fetch).toHaveBeenCalledWith(
            `https://discord.com/api/v10/guilds/${GUILD_ID}/roles`,
            expect.anything()
        );
        expect(result).toEqual({ r1: "Admin", r2: "Member" });
    });

    it("uses correct endpoint and filters text, voice and stage channels in getSlowmodeChannelMap", async () => {
        const mockChannels = [
            { id: "c1", name: "general", type: 0 },
            { id: "v1", name: "Lounge", type: 2 },
            { id: "s1", name: "Stage", type: 13 },
            { id: "cat1", name: "Text Channels", type: 4 },
            { id: "a1", name: "announcements", type: 5 },
            { id: "t1", name: "thread", type: 11 },
            { id: "f1", name: "forum", type: 15 },
        ];
        globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse(mockChannels));

        const result = await getSlowmodeChannelMap(GUILD_ID);

        expect(redis.get).toHaveBeenCalledWith(`guild:${GUILD_ID}:slowmode-channels`);
        expect(globalThis.fetch).toHaveBeenCalledWith(
            `https://discord.com/api/v10/guilds/${GUILD_ID}/channels`,
            expect.anything()
        );
        expect(result).toEqual({ c1: "general", v1: "Lounge", s1: "Stage" });
    });
});

describe("invalidateGuildChannelCache", () => {
    it("deletes all 4 redis keys and revalidates all 4 next.js cache tags", async () => {
        vi.mocked(redis.del).mockResolvedValue(4);

        await invalidateGuildChannelCache(GUILD_ID);

        expect(redis.del).toHaveBeenCalledWith([
            `guild:${GUILD_ID}:categories`,
            `guild:${GUILD_ID}:voice-channels`,
            `guild:${GUILD_ID}:channels`,
            `guild:${GUILD_ID}:slowmode-channels`,
        ]);

        expect(revalidateTag).toHaveBeenCalledWith(`guild-voice-channels-${GUILD_ID}`, "max");
        expect(revalidateTag).toHaveBeenCalledWith(`guild-categories-${GUILD_ID}`, "max");
        expect(revalidateTag).toHaveBeenCalledWith(`guild-channels-${GUILD_ID}`, "max");
        expect(revalidateTag).toHaveBeenCalledWith(`guild-slowmode-channels-${GUILD_ID}`, "max");
    });

    it("still revalidates cache tags even if Redis delete throws an error", async () => {
        vi.mocked(redis.del).mockRejectedValue(new Error("Redis network error"));

        await invalidateGuildChannelCache(GUILD_ID);

        expect(console.error).toHaveBeenCalled();
        expect(revalidateTag).toHaveBeenCalledTimes(4);
    });
});