import { describe, it, expect, vi, beforeEach } from "vitest";
import type { User } from "next-auth";
import {
    verifyGuildAccess,
    currentUserManagesGuild,
    getGuildConfigField,
    saveGuildConfigField,
    replaceGuildConfigField,
} from "./guild";

const {
    mockAuth,
    mockGetGuildLists,
    mockDbQuery,
    mockRedisDel,
    mockRedisPublish,
} = vi.hoisted(() => ({
    mockAuth: vi.fn(),
    mockGetGuildLists: vi.fn(),
    mockDbQuery: vi.fn(),
    mockRedisDel: vi.fn(),
    mockRedisPublish: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
    auth: mockAuth,
}));

vi.mock("@/features/_shared/servers", () => ({
    getGuildLists: mockGetGuildLists,
}));

vi.mock("@/lib/db", () => ({
    db: {
        query: mockDbQuery,
    },
}));

vi.mock("@/lib/redis", () => ({
    default: {
        del: mockRedisDel,
        publish: mockRedisPublish,
    },
}));

const GUILD_ID = "123456789012345678";

describe("Guild Config - Unit Tests", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("verifyGuildAccess", () => {
        it("throws when session is null or missing user", async () => {
            mockAuth.mockResolvedValueOnce(null);

            await expect(verifyGuildAccess(GUILD_ID)).rejects.toThrow(
                "Unauthorized: Please sign in."
            );
        });

        it("throws when session has no accessToken", async () => {
            mockAuth.mockResolvedValueOnce({
                user: { id: "1", name: "User" },
                accessToken: undefined,
            });

            await expect(verifyGuildAccess(GUILD_ID)).rejects.toThrow(
                "Unauthorized: Missing access token."
            );
        });

        it("throws forbidden when guild is not in mutualGuilds", async () => {
            mockAuth.mockResolvedValueOnce({
                user: { id: "1", name: "User" },
                accessToken: "token_abc",
            });

            mockGetGuildLists.mockResolvedValueOnce({
                mutualGuilds: [
                    { id: "999999999999999999", name: "Other Server", icon: null, permissions: "8" },
                ],
                inviteableGuilds: [],
            });

            await expect(verifyGuildAccess(GUILD_ID)).rejects.toThrow(
                "Forbidden: You do not have permission to manage this server or the bot is not present."
            );
        });

        it("returns user object when user has guild access", async () => {
            const mockUser: User = { id: "user_123", name: "Discord Admin" };
            mockAuth.mockResolvedValueOnce({
                user: mockUser,
                accessToken: "token_abc",
            });

            mockGetGuildLists.mockResolvedValueOnce({
                mutualGuilds: [
                    { id: GUILD_ID, name: "Target Guild", icon: null, permissions: "8" },
                ],
                inviteableGuilds: [],
            });

            const user = await verifyGuildAccess(GUILD_ID);
            expect(user).toEqual(mockUser);
            expect(mockGetGuildLists).toHaveBeenCalledWith("token_abc");
        });
    });

    describe("currentUserManagesGuild", () => {
        it("is false without a session", async () => {
            mockAuth.mockResolvedValueOnce(null);

            await expect(currentUserManagesGuild(GUILD_ID)).resolves.toBe(false);
            expect(mockGetGuildLists).not.toHaveBeenCalled();
        });

        it("is false without an access token", async () => {
            mockAuth.mockResolvedValueOnce({
                user: { id: "1", name: "User" },
                accessToken: undefined,
            });

            await expect(currentUserManagesGuild(GUILD_ID)).resolves.toBe(false);
        });

        it("is false for a guild the caller does not manage", async () => {
            mockAuth.mockResolvedValueOnce({
                user: { id: "1", name: "User" },
                accessToken: "token_abc",
            });
            mockGetGuildLists.mockResolvedValueOnce({
                mutualGuilds: [
                    { id: "999999999999999999", name: "Other Server", icon: null, permissions: "8" },
                ],
                inviteableGuilds: [],
            });

            await expect(currentUserManagesGuild(GUILD_ID)).resolves.toBe(false);
        });

        it("is true for a guild the caller manages", async () => {
            mockAuth.mockResolvedValueOnce({
                user: { id: "1", name: "User" },
                accessToken: "token_abc",
            });
            mockGetGuildLists.mockResolvedValueOnce({
                mutualGuilds: [
                    { id: GUILD_ID, name: "Target Guild", icon: null, permissions: "8" },
                ],
                inviteableGuilds: [],
            });

            await expect(currentUserManagesGuild(GUILD_ID)).resolves.toBe(true);
        });

        it("is false when the guild list lookup yields nothing", async () => {
            // `getGuildLists` swallows its own failures and returns empty lists, so a lookup
            // problem must read as "no access" rather than reaching the page.
            mockAuth.mockResolvedValueOnce({
                user: { id: "1", name: "User" },
                accessToken: "token_abc",
            });
            mockGetGuildLists.mockResolvedValueOnce({
                mutualGuilds: [],
                inviteableGuilds: [],
            });

            await expect(currentUserManagesGuild(GUILD_ID)).resolves.toBe(false);
        });
    });

    describe("getGuildConfigField", () => {
        it("returns null when no matching row is found", async () => {
            mockDbQuery.mockResolvedValueOnce({ rows: [] });

            const result = await getGuildConfigField(GUILD_ID, "prefix");

            expect(result).toBeNull();
            expect(mockDbQuery).toHaveBeenCalledWith(expect.any(String), [GUILD_ID, "prefix"]);
        });

        it("returns null when row exists but config column is null", async () => {
            mockDbQuery.mockResolvedValueOnce({ rows: [{ config: null }] });

            const result = await getGuildConfigField(GUILD_ID, "prefix");

            expect(result).toBeNull();
        });

        it("returns parsed config when value exists", async () => {
            const expectedConfig = { channelId: "111", enabled: true };
            mockDbQuery.mockResolvedValueOnce({
                rows: [{ config: expectedConfig }],
            });

            const result = await getGuildConfigField(GUILD_ID, "welcome");

            expect(result).toEqual(expectedConfig);
        });
    });

    describe("saveGuildConfigField", () => {
        it("serializes value to JSON and executes query", async () => {
            mockDbQuery.mockResolvedValueOnce({ rows: [] });
            mockRedisDel.mockResolvedValueOnce(1);
            mockRedisPublish.mockResolvedValueOnce(1);

            const payload = { enabled: true, cooldown: 5 };
            await saveGuildConfigField(GUILD_ID, "leveling", payload);

            expect(mockDbQuery).toHaveBeenCalledWith(
                expect.stringContaining(""),
                [GUILD_ID, "leveling", JSON.stringify(payload)]
            );
        });

        it("invalidates Redis cache and publishes update", async () => {
            mockDbQuery.mockResolvedValueOnce({ rows: [] });
            mockRedisDel.mockResolvedValueOnce(1);
            mockRedisPublish.mockResolvedValueOnce(1);

            await saveGuildConfigField(GUILD_ID, "music", { volume: 80 });

            expect(mockRedisDel).toHaveBeenCalledWith(`config:guild:${GUILD_ID}`);
            expect(mockRedisPublish).toHaveBeenCalledWith("config_updates", `invalidate:${GUILD_ID}`);
        });

        it("swallows redis errors and does not throw", async () => {
            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
            mockDbQuery.mockResolvedValueOnce({ rows: [] });
            mockRedisDel.mockRejectedValueOnce(new Error("Redis connection dropped"));

            await expect(saveGuildConfigField(GUILD_ID, "music", { volume: 80 })).resolves.not.toThrow();

            expect(consoleSpy).toHaveBeenCalledWith(
                `Failed to clear cache for guild ${GUILD_ID}:`,
                expect.any(Error)
            );
            consoleSpy.mockRestore();
        });
    });

    describe("replaceGuildConfigField", () => {
        it("serializes payload and passes true for create_if_missing flag", async () => {
            mockDbQuery.mockResolvedValueOnce({ rows: [] });
            mockRedisDel.mockResolvedValueOnce(1);
            mockRedisPublish.mockResolvedValueOnce(1);

            const payload = { freshKey: "newValue" };
            await replaceGuildConfigField(GUILD_ID, "notifications", payload);

            expect(mockDbQuery).toHaveBeenCalledWith(
                expect.stringContaining("JSONB_SET("),
                [GUILD_ID, "notifications", JSON.stringify(payload)]
            );
            expect(mockRedisDel).toHaveBeenCalledWith(`config:guild:${GUILD_ID}`);
            expect(mockRedisPublish).toHaveBeenCalledWith("config_updates", `invalidate:${GUILD_ID}`);
        });

        it("gracefully catches Redis errors", async () => {
            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
            mockDbQuery.mockResolvedValueOnce({ rows: [] });
            mockRedisDel.mockRejectedValueOnce(new Error("Redis timeout"));

            await expect(replaceGuildConfigField(GUILD_ID, "notifications", {})).resolves.not.toThrow();

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });
});