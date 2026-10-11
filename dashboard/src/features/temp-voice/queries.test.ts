import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    getTempVoiceHubs,
    saveTempVoiceHub,
    deleteTempVoiceHub,
} from "./queries";
import { backendFetch } from "@/lib/backend";
import type { SaveTempVoiceHubInput } from "./types";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>()
);

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
    },
}));

vi.mock("@/lib/backend", () => ({
    backendFetch: vi.fn(),
}));

function okResponse(): Response {
    return new Response("", { status: 200 });
}

function errorResponse(body: string): Response {
    return new Response(body, { status: 500 });
}

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

        it("should query hubs scoped to the guild in creation order", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await getTempVoiceHubs("guild_123");

            const sql = mockQuery.mock.calls[0][0];
            expect(sql).toContain("FROM temp_voice_hubs");
            expect(sql).toContain("WHERE guild_id = $1");
            expect(sql).toContain("ORDER BY created_at ASC");
        });

        it("should return an empty array when the guild has no hubs", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await expect(getTempVoiceHubs("guild_123")).resolves.toEqual([]);
        });

        it("should throw when a row fails validation", async () => {
            mockQuery.mockResolvedValue({ rows: [{ id: "hub_1" }] });

            await expect(getTempVoiceHubs("guild_123")).rejects.toThrow();
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

        it("should upsert on the hub id", async () => {
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

            const sql = mockQuery.mock.calls[0][0];
            expect(sql).toContain("COALESCE($1, gen_random_uuid())");
            expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
            expect(sql).toContain("RETURNING *");
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

        it("should pass through a provided hub id", async () => {
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

            await saveTempVoiceHub("guild_123", {
                id: "hub_1",
                guild_id: "guild_123",
                name: "Gaming",
                hub_channel_id: "chan_1",
                category_id: "cat_1",
                default_channel_name: "{user.display_name}'s Lounge",
            });

            const [, params = []] = mockQuery.mock.calls[0];
            expect(params[0]).toBe("hub_1");
        });

        it("should coerce a blank hub id to null", async () => {
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

            for (const id of ["", "   "]) {
                mockQuery.mockClear();
                await saveTempVoiceHub("guild_123", {
                    id,
                    guild_id: "guild_123",
                    name: "Gaming",
                    hub_channel_id: "chan_1",
                    category_id: "cat_1",
                    default_channel_name: "{user.display_name}'s Lounge",
                });

                const [, params = []] = mockQuery.mock.calls[0];
                expect(params[0]).toBeNull();
            }
        });

        it("should bind columns in order", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "hub_1",
                        guild_id: "guild_123",
                        name: "Gaming",
                        hub_channel_id: "chan_1",
                        category_id: "cat_1",
                        user_limit: 0,
                        interface_channel_id: "chan_2",
                        default_channel_name: "{user.display_name}'s Lounge",
                    },
                ],
            });

            await saveTempVoiceHub("guild_123", {
                id: "hub_1",
                guild_id: "guild_123",
                name: "Gaming",
                hub_channel_id: "chan_1",
                category_id: "cat_1",
                user_limit: 0,
                interface_channel_id: "chan_2",
                default_channel_name: "{user.display_name}'s Lounge",
            });

            const [, params = []] = mockQuery.mock.calls[0];
            expect(params).toEqual([
                "hub_1",
                "guild_123",
                "Gaming",
                "chan_1",
                "cat_1",
                0,
                "chan_2",
                "{user.display_name}'s Lounge",
            ]);
        });

        it("should throw when the returned row fails validation", async () => {
            mockQuery.mockResolvedValue({ rows: [{ id: "hub_1" }] });

            await expect(
                saveTempVoiceHub("guild_123", {
                    guild_id: "guild_123",
                    name: "Gaming",
                    hub_channel_id: "chan_1",
                    category_id: "cat_1",
                    default_channel_name: "{user.display_name}'s Lounge",
                })
            ).rejects.toThrow();
        });
    });

    describe("deleteTempVoiceHub", () => {
        it("should delete the hub and call the backend when a category was returned", async () => {
            mockQuery.mockResolvedValue({ rows: [{ category_id: "cat_1" }] });
            vi.mocked(backendFetch).mockResolvedValue(okResponse());

            await deleteTempVoiceHub("guild_123", "hub_1");

            const params = mockQuery.mock.calls[0][1];
            expect(params).toEqual(["hub_1", "guild_123"]);
            expect(vi.mocked(backendFetch).mock.calls[0][0]).toContain(
                "/api/guilds/guild_123/category/delete-entire"
            );
        });

        it("should delete with the expected SQL shape", async () => {
            mockQuery.mockResolvedValue({ rows: [{ category_id: "cat_1" }] });
            vi.mocked(backendFetch).mockResolvedValue(okResponse());

            await deleteTempVoiceHub("guild_123", "hub_1");

            const sql = mockQuery.mock.calls[0][0];
            expect(sql).toContain("DELETE");
            expect(sql).toContain("FROM temp_voice_hubs");
            expect(sql).toContain("RETURNING category_id");
        });

        it("should call the backend with the deleted category", async () => {
            mockQuery.mockResolvedValue({ rows: [{ category_id: "cat_1" }] });
            vi.mocked(backendFetch).mockResolvedValue(okResponse());

            await deleteTempVoiceHub("guild_123", "hub_1");

            expect(backendFetch).toHaveBeenCalledWith(
                "/api/guilds/guild_123/category/delete-entire",
                expect.objectContaining({ method: "DELETE" })
            );
            const [, init] = vi.mocked(backendFetch).mock.calls[0];
            expect(init?.headers).toEqual({ "Content-Type": "application/json" });
            expect(typeof init?.body === "string" ? JSON.parse(init.body) : null).toEqual({
                category_id: "cat_1",
            });
        });

        it("should skip the backend call when no row was deleted", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await deleteTempVoiceHub("guild_123", "missing");

            expect(backendFetch).not.toHaveBeenCalled();
        });

        it("should throw with the backend error body", async () => {
            mockQuery.mockResolvedValue({ rows: [{ category_id: "cat_1" }] });
            vi.mocked(backendFetch).mockResolvedValue(errorResponse("category not found"));

            await expect(deleteTempVoiceHub("guild_123", "hub_1")).rejects.toThrow(
                "Failed to delete temp voice hub: category not found"
            );
        });
    });
});
