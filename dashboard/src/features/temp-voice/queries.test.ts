import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    getTempVoiceHubs,
    saveTempVoiceHub,
    deleteTempVoiceHub,
} from "./queries";
import type { SaveTempVoiceHubInput } from "./types";

interface MockResponse {
    ok: boolean;
    text(): Promise<string>;
}

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>()
);

const mockFetch = vi.hoisted(() =>
    vi.fn<(url: string, init?: RequestInit) => Promise<MockResponse>>()
);

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
    },
}));

vi.stubGlobal("fetch", mockFetch);

describe("Temp Voice Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getTempVoiceHubs", () => {
        it("should return parsed hubs", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "hub_1",
                        guild_id: "guild_123",
                        name: "Gaming",
                        hub_channel_id: "chan_1",
                        category_id: "cat_1",
                        user_limit: null,
                        interface_channel_id: null,
                        default_channel_name: "{user.display_name}'s Lounge",
                    },
                ],
            });

            const result = await getTempVoiceHubs("guild_123");

            expect(result[0].id).toBe("hub_1");
            expect(result[0].name).toBe("Gaming");
            const params = mockQuery.mock.calls[0][1];
            expect(params).toEqual(["guild_123"]);
        });
    });

    describe("saveTempVoiceHub", () => {
        it("should insert a new hub and parse the returned row", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "hub_1",
                        guild_id: "guild_123",
                        name: "Gaming",
                        hub_channel_id: "chan_1",
                        category_id: "cat_1",
                        user_limit: 5,
                        interface_channel_id: "chan_2",
                        default_channel_name: "{user.display_name}'s Lounge",
                    },
                ],
            });

            const hub: SaveTempVoiceHubInput = {
                guild_id: "guild_123",
                name: "Gaming",
                hub_channel_id: "chan_1",
                category_id: "cat_1",
                user_limit: 5,
                interface_channel_id: "chan_2",
                default_channel_name: "{user.display_name}'s Lounge",
            };

            const result = await saveTempVoiceHub("guild_123", hub);

            expect(mockQuery.mock.calls[0][0]).toContain("INSERT INTO temp_voice_hubs");
            expect(result.id).toBe("hub_1");
            expect(result.user_limit).toBe(5);
        });

        it("should pass null for missing id and nullish fields", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "hub_1",
                        guild_id: "guild_123",
                        name: "Gaming",
                        hub_channel_id: "chan_1",
                        category_id: "cat_1",
                        user_limit: null,
                        interface_channel_id: null,
                        default_channel_name: "{user.display_name}'s Lounge",
                    },
                ],
            });

            const hub: SaveTempVoiceHubInput = {
                guild_id: "guild_123",
                name: "Gaming",
                hub_channel_id: "chan_1",
                category_id: "cat_1",
                default_channel_name: "{user.display_name}'s Lounge",
            };

            await saveTempVoiceHub("guild_123", hub);

            const [, params = []] = mockQuery.mock.calls[0];
            expect(params[0]).toBeNull();
            expect(params[5]).toBeNull();
            expect(params[6]).toBeNull();
        });
    });

    describe("deleteTempVoiceHub", () => {
        it("should delete the hub and call the backend when a category was returned", async () => {
            mockQuery.mockResolvedValue({ rows: [{ category_id: "cat_1" }] });
            mockFetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(""),
            });

            await deleteTempVoiceHub("guild_123", "hub_1");

            const params = mockQuery.mock.calls[0][1];
            expect(params).toEqual(["hub_1", "guild_123"]);
            const url = mockFetch.mock.calls[0][0];
            expect(url).toContain("/api/guilds/guild_123/category/delete-entire");
        });

        it("should skip the backend call when no row was deleted", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await deleteTempVoiceHub("guild_123", "missing");

            expect(mockFetch).not.toHaveBeenCalled();
        });

        it("should throw with the backend error body", async () => {
            mockQuery.mockResolvedValue({ rows: [{ category_id: "cat_1" }] });
            mockFetch.mockResolvedValue({
                ok: false,
                text: () => Promise.resolve("category not found"),
            });

            await expect(deleteTempVoiceHub("guild_123", "hub_1")).rejects.toThrow(
                "category not found"
            );
        });
    });
});
