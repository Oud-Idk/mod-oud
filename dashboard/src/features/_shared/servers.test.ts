import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { unstable_cache } from "next/cache";

// Mock Next.js and React caching layers
vi.mock("react", () => ({
    cache: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

vi.mock("next/cache", () => ({
    unstable_cache: vi.fn((fn: (...args: unknown[]) => unknown) => fn),
}));

import { getGuildLists } from "./servers";

interface GuildFetchResult {
    id: string;
    name: string;
    icon: string | null;
    permissions: string;
    owner?: boolean;
    features?: string[];
}

type BotGuildsFn = () => Promise<GuildFetchResult[]>;
type UserGuildsFn = (token: string) => Promise<GuildFetchResult[]>;

describe("servers / getGuildLists", () => {
    const originalEnv = process.env;
    const BOT_TOKEN = "test-bot-token";
    const USER_TOKEN = "test-user-token";
    const DISCORD_API_URL = "https://discord.com/api/users/@me/guilds";

    const mockUnstableCache = vi.mocked(unstable_cache);
    const getBotGuildsInternal: BotGuildsFn = mockUnstableCache.mock.calls[0][0];
    const getUserGuildsInternal: UserGuildsFn = mockUnstableCache.mock.calls[1][0];

    beforeEach(() => {
        process.env = { ...originalEnv, DISCORD_TOKEN: BOT_TOKEN };
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.spyOn(console, "warn").mockImplementation(() => undefined);
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.restoreAllMocks();
        vi.clearAllTimers();
    });

    describe("unstable_cache configuration", () => {
        it("registers bot guilds cache with 180s revalidation and tag", () => {
            expect(unstable_cache).toHaveBeenCalledWith(
                expect.any(Function),
                ["discord_bot_guilds"],
                { revalidate: 180, tags: ["bot-guilds"] }
            );
        });

        it("registers user guilds cache with 120s revalidation", () => {
            expect(unstable_cache).toHaveBeenCalledWith(
                expect.any(Function),
                ["discord_user_guilds"],
                { revalidate: 120 }
            );
        });
    });

    describe("Schema & Permission handling", () => {
        it("transforms missing permissions to '0' (kills transform fallback mutants)", async () => {
            vi.spyOn(global, "fetch").mockResolvedValueOnce(
                new Response(JSON.stringify([{ id: "g1", name: "Guild 1", icon: null }]), { status: 200 })
            );

            const result = await getUserGuildsInternal(USER_TOKEN);
            expect(result[0].permissions).toBe("0");
        });

        it("transforms numeric permissions to string", async () => {
            vi.spyOn(global, "fetch").mockResolvedValueOnce(
                new Response(JSON.stringify([{ id: "g1", name: "Guild 1", icon: null, permissions: 32 }]), { status: 200 })
            );

            const result = await getUserGuildsInternal(USER_TOKEN);
            expect(result[0].permissions).toBe("32");
        });

        it("handles invalid BigInt permission strings by returning false (kills catch block mutant)", async () => {
            const userGuilds = [
                { id: "bad-perm", name: "Bad Perm Guild", icon: null, permissions: "invalid-bigint" },
            ];

            vi.spyOn(global, "fetch").mockImplementation((url) => {
                if (url !== DISCORD_API_URL) {
                    return Promise.resolve(new Response(null, { status: 404 }));
                }
                return Promise.resolve(new Response(JSON.stringify(userGuilds), { status: 200 }));
            });

            const result = await getGuildLists(USER_TOKEN);

            expect(result.mutualGuilds).toHaveLength(0);
            expect(result.inviteableGuilds).toHaveLength(0);
        });
    });

    describe("fetchWithRetry", () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        it("does not enter retry block or schedule timers on status 200 (kills `true && retries > 0`)", async () => {
            const setTimeoutSpy = vi.spyOn(global, "setTimeout");
            const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
                new Response(JSON.stringify([]), { status: 200 })
            );

            await getBotGuildsInternal();

            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(setTimeoutSpy).not.toHaveBeenCalled();
        });

        it("parses retry_after from JSON body with exact arithmetic and jitter", async () => {
            vi.spyOn(Math, "random").mockReturnValue(0.5);
            const setTimeoutSpy = vi.spyOn(global, "setTimeout");

            let attempt = 0;
            vi.spyOn(global, "fetch").mockImplementation(() => {
                attempt++;
                if (attempt === 1) {
                    return Promise.resolve(
                        new Response(JSON.stringify({ retry_after: 1.25 }), {
                            status: 429,
                            headers: { "Content-Type": "application/json" },
                        })
                    );
                }
                return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
            });

            const promise = getBotGuildsInternal();
            await vi.runAllTimersAsync();
            await promise;

            expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 1575);
            expect(attempt).toBe(2);
        });

        it("uses default 1000ms delay when JSON body has no retry_after field", async () => {
            vi.spyOn(Math, "random").mockReturnValue(0.5);
            const setTimeoutSpy = vi.spyOn(global, "setTimeout");

            let attempt = 0;
            vi.spyOn(global, "fetch").mockImplementation(() => {
                attempt++;
                if (attempt === 1) {
                    return Promise.resolve(
                        new Response(JSON.stringify({ message: "Rate limited without retry_after" }), {
                            status: 429,
                            headers: { "Content-Type": "application/json" },
                        })
                    );
                }
                return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
            });

            const promise = getBotGuildsInternal();
            await vi.runAllTimersAsync();
            await promise;

            expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 1125);
        });

        it("falls back to Retry-After header with exact arithmetic when JSON parsing fails", async () => {
            vi.spyOn(Math, "random").mockReturnValue(0.5);
            const setTimeoutSpy = vi.spyOn(global, "setTimeout");

            let attempt = 0;
            vi.spyOn(global, "fetch").mockImplementation(() => {
                attempt++;
                if (attempt === 1) {
                    return Promise.resolve(
                        new Response("Not JSON", {
                            status: 429,
                            headers: { "Retry-After": "2.5" },
                        })
                    );
                }
                return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
            });

            const promise = getBotGuildsInternal();
            await vi.runAllTimersAsync();
            await promise;

            expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 2825);
        });

        it("uses default 1000ms when Retry-After header is NaN", async () => {
            vi.spyOn(Math, "random").mockReturnValue(0.5);
            const setTimeoutSpy = vi.spyOn(global, "setTimeout");

            let attempt = 0;
            vi.spyOn(global, "fetch").mockImplementation(() => {
                attempt++;
                if (attempt === 1) {
                    return Promise.resolve(
                        new Response("Not JSON", {
                            status: 429,
                            headers: { "Retry-After": "invalid-float" },
                        })
                    );
                }
                return Promise.resolve(new Response(JSON.stringify([]), { status: 200 }));
            });

            const promise = getBotGuildsInternal();
            await vi.runAllTimersAsync();
            await promise;

            expect(setTimeoutSpy).toHaveBeenLastCalledWith(expect.any(Function), 1125);
        });

        it("exhausts retries and stops at exactly 4 fetch calls (kills `retries >= 0`)", async () => {
            const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValue(
                new Response(JSON.stringify({ retry_after: 0.01 }), { status: 429 })
            );

            const promise = getBotGuildsInternal().catch(() => undefined);
            await vi.runAllTimersAsync();
            await promise;

            expect(fetchSpy).toHaveBeenCalledTimes(4);
        });
    });

    describe("getBotGuildsCached", () => {
        it("throws if DISCORD_TOKEN is empty string and does not call fetch", async () => {
            process.env.DISCORD_TOKEN = "";
            const fetchSpy = vi.spyOn(global, "fetch");

            await expect(getBotGuildsInternal()).rejects.toThrow("DISCORD_TOKEN environment variable is not defined");
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it("throws if DISCORD_TOKEN is undefined and does not call fetch", async () => {
            delete process.env.DISCORD_TOKEN;
            const fetchSpy = vi.spyOn(global, "fetch");

            await expect(getBotGuildsInternal()).rejects.toThrow("DISCORD_TOKEN environment variable is not defined");
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it("calls fetch with the exact Discord API URL and Bot Authorization header", async () => {
            const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
                new Response(JSON.stringify([]), { status: 200 })
            );

            await getBotGuildsInternal();

            expect(fetchSpy).toHaveBeenCalledWith(DISCORD_API_URL, {
                headers: { Authorization: `Bot ${BOT_TOKEN}` },
            });
        });

        it("throws when response is not ok even if body contains valid JSON (kills `if (!res.ok)` mutant)", async () => {
            vi.spyOn(global, "fetch").mockResolvedValueOnce(
                new Response(JSON.stringify([{ id: "1", name: "Guild", icon: null }]), { status: 500 })
            );

            await expect(getBotGuildsInternal()).rejects.toThrow(/Discord bot guilds fetch failed: 500/);
        });

        it("handles res.text() rejection with empty fallback string", async () => {
            const mockResponse = new Response(null, { status: 500 });
            vi.spyOn(mockResponse, "text").mockRejectedValue(new Error("Stream detached"));

            vi.spyOn(global, "fetch").mockResolvedValueOnce(mockResponse);

            await expect(getBotGuildsInternal()).rejects.toThrow("Discord bot guilds fetch failed: 500 ");
        });
    });

    describe("getUserGuildsCached", () => {
        it("returns empty array directly on 401 Unauthorized (kills mutant returning ['Stryker was here'])", async () => {
            vi.spyOn(global, "fetch").mockResolvedValueOnce(
                new Response("Unauthorized", { status: 401 })
            );

            const result = await getUserGuildsInternal(USER_TOKEN);
            expect(result).toEqual([]);
        });

        it("returns empty array directly on 403 Forbidden", async () => {
            vi.spyOn(global, "fetch").mockResolvedValueOnce(
                new Response("Forbidden", { status: 403 })
            );

            const result = await getUserGuildsInternal(USER_TOKEN);
            expect(result).toEqual([]);
        });

        it("calls fetch with the exact Discord API URL and Bearer token", async () => {
            const fetchSpy = vi.spyOn(global, "fetch").mockResolvedValueOnce(
                new Response(JSON.stringify([]), { status: 200 })
            );

            await getUserGuildsInternal(USER_TOKEN);

            expect(fetchSpy).toHaveBeenCalledWith(DISCORD_API_URL, {
                headers: { Authorization: `Bearer ${USER_TOKEN}` },
            });
        });

        it("throws when response is not ok (500) even if body has valid JSON", async () => {
            vi.spyOn(global, "fetch").mockResolvedValueOnce(
                new Response(JSON.stringify([{ id: "1", name: "Guild", icon: null }]), { status: 500 })
            );

            await expect(getUserGuildsInternal(USER_TOKEN)).rejects.toThrow(/Discord user guilds fetch failed: 500/);
        });

        it("handles res.text() rejection with empty fallback string in user fetch", async () => {
            const mockResponse = new Response(null, { status: 500 });
            vi.spyOn(mockResponse, "text").mockRejectedValue(new Error("Stream failed"));

            vi.spyOn(global, "fetch").mockResolvedValueOnce(mockResponse);

            await expect(getUserGuildsInternal(USER_TOKEN)).rejects.toThrow("Discord user guilds fetch failed: 500 ");
        });
    });

    describe("getGuildLists", () => {
        it("returns empty lists without calling fetch if userAccessToken is undefined", async () => {
            const fetchSpy = vi.spyOn(global, "fetch");

            const result = await getGuildLists(undefined);

            expect(result).toEqual({ mutualGuilds: [], inviteableGuilds: [] });
            expect(fetchSpy).not.toHaveBeenCalled();
        });

        it("correctly partitions mutual and inviteable guilds based on bot guild IDs", async () => {
            const userGuilds = [
                { id: "g-mutual", name: "Mutual", icon: null, permissions: "32" },
                { id: "g-invite", name: "Inviteable", icon: null, permissions: "8" },
                { id: "g-none", name: "No Perms", icon: null, permissions: "1" },
            ];
            const botGuilds = [
                { id: "g-mutual", name: "Mutual", icon: null, permissions: "8" },
            ];

            vi.spyOn(global, "fetch").mockImplementation((url, opts) => {
                if (url !== DISCORD_API_URL) {
                    return Promise.resolve(new Response(null, { status: 404 }));
                }

                const headers = new Headers(opts?.headers);
                const auth = headers.get("authorization");

                if (auth === `Bearer ${USER_TOKEN}`) {
                    return Promise.resolve(new Response(JSON.stringify(userGuilds), { status: 200 }));
                }
                if (auth === `Bot ${BOT_TOKEN}`) {
                    return Promise.resolve(new Response(JSON.stringify(botGuilds), { status: 200 }));
                }
                return Promise.resolve(new Response(null, { status: 400 }));
            });

            const result = await getGuildLists(USER_TOKEN);

            expect(result.mutualGuilds).toHaveLength(1);
            expect(result.mutualGuilds[0].id).toBe("g-mutual");

            expect(result.inviteableGuilds).toHaveLength(1);
            expect(result.inviteableGuilds[0].id).toBe("g-invite");
        });

        it("catches errors and safely returns empty lists when an error occurs", async () => {
            vi.spyOn(global, "fetch").mockRejectedValue(new Error("Network offline"));

            const result = await getGuildLists(USER_TOKEN);

            expect(result).toEqual({ mutualGuilds: [], inviteableGuilds: [] });
        });
    });
});