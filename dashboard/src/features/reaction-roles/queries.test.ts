import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    getReactionMessages,
    getReactionMessageById,
    deleteReactionMessage,
    saveReactionMessage,
    sendReactionMessageToBackend,
    deleteDiscordMessageFromBackend,
    notifyBackendReactionMessageEdit,
} from "./queries";
import type { SaveReactionMessageInput } from "./types";

interface MockResponse {
    ok: boolean;
    text(): Promise<string>;
    json(): Promise<unknown>;
}

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number }>>()
);

const mockConnect = vi.hoisted(() =>
    vi.fn<() => Promise<{
        query: (sql: string, params?: unknown[]) => Promise<{ rows: { id?: number | string }[]; rowCount?: number }>;
        release: () => void;
    }>>()
);

const mockFetch = vi.hoisted(() =>
    vi.fn<(url: string, init?: RequestInit) => Promise<MockResponse>>()
);

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
        connect: mockConnect,
    },
}));

vi.stubGlobal("fetch", mockFetch);

describe("Reaction Roles Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getReactionMessages", () => {
        it("should pass guildId as query parameter", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: 1,
                        name: "Verify",
                        guild_id: "guild_123",
                        channel_id: "chan_1",
                        message_id: "msg_1",
                        mode: "REACTION",
                        message: { format: "TEXT", content: "Pick", embed: {} },
                        reactions: [{ emoji: "🎉", role_id: "role_1" }],
                        buttons: [],
                    },
                ],
            });

            const result = await getReactionMessages("guild_123");

            expect(result[0].id).toBe(1);
            expect(mockQuery.mock.calls[0][1]).toEqual(["guild_123"]);
        });
    });

    describe("getReactionMessageById", () => {
        it("should pass id as query parameter", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: 5,
                        name: "Verify",
                        guild_id: "guild_123",
                        mode: "BUTTON",
                        message: { format: "TEXT", content: "Roles", embed: {} },
                        buttons: [{ role_id: "role_2", custom_id: "btn_1", style: "SUCCESS" }],
                    },
                ],
            });

            const result = await getReactionMessageById(5);

            expect(result?.id).toBe(5);
            expect(mockQuery.mock.calls[0][1]).toEqual([5]);
        });

        it("should return null when no row matches", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            const result = await getReactionMessageById(999);

            expect(result).toBeNull();
            expect(mockQuery.mock.calls[0][1]).toEqual([999]);
        });
    });

    describe("deleteReactionMessage", () => {
        it("should pass id as query parameter and return boolean", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

            const result = await deleteReactionMessage(3);

            expect(result).toBe(true);
            expect(mockQuery.mock.calls[0][1]).toEqual([3]);
        });

        it("should return false when rowCount is 0", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            const result = await deleteReactionMessage(3);

            expect(result).toBe(false);
            expect(mockQuery.mock.calls[0][1]).toEqual([3]);
        });
    });

    describe("saveReactionMessage", () => {


        it("should execute transaction calls and pass internalId to cleanup deletes", async () => {
            const client = {
                query: vi.fn<
                    (sql: string, params?: unknown[]) => Promise<{ rows: { id?: number | string }[]; rowCount?: number }>
                >(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            client.query.mockResolvedValue({ rows: [{ id: "10" }], rowCount: 1 });

            const input: SaveReactionMessageInput = {
                name: "Verify",
                guild_id: "guild_123",
                channel_id: "chan_1",
                message: { format: "TEXT", content: "Pick", embed: {} },
                mode: "REACTION",
                reactions: [{ emoji: "🎉", role_id: "role_1" }],
                buttons: [],
            };

            const result = await saveReactionMessage(input);

            // Verify query parameters passed across sequential calls
            expect(client.query.mock.calls[0][1]).toBeUndefined(); // BEGIN
            expect(client.query.mock.calls[1][1]).toEqual([null, "chan_1", "guild_123", "REACTION", "Verify", input.message]); // INSERT mainParams
            expect(client.query.mock.calls[2][1]).toEqual([10]); // DELETE reaction_roles
            expect(client.query.mock.calls[3][1]).toEqual([10]); // DELETE button_roles
            expect(client.release).toHaveBeenCalled();
            expect(result.id).toBe(10);
        });

        it("should handle undefined vs defined message_id in mainParams", async () => {
            const client = {
                query: vi.fn<
                    (sql: string, params?: unknown[]) => Promise<{ rows: { id?: number | string }[]; rowCount?: number }>
                >(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            client.query.mockResolvedValue({ rows: [{ id: "10" }], rowCount: 1 });

            // Case A: Undefined message_id -> coalesces to null
            const inputNull: SaveReactionMessageInput = {
                name: "Verify",
                guild_id: "guild_123",
                channel_id: "chan_1",
                message_id: undefined,
                message: { format: "TEXT", content: "Pick", embed: {} },
                mode: "REACTION",
                reactions: [{ emoji: "🎉", role_id: "role_1" }],
            };

            await saveReactionMessage(inputNull);
            expect(client.query.mock.calls[1][1]).toEqual([null, "chan_1", "guild_123", "REACTION", "Verify", inputNull.message]);

            client.query.mockClear();

            // Case B: Defined string message_id -> passed through
            const inputDefined: SaveReactionMessageInput = {
                name: "Verify",
                guild_id: "guild_123",
                channel_id: "chan_1",
                message_id: "msg_200",
                message: { format: "TEXT", content: "Pick", embed: {} },
                mode: "REACTION",
                reactions: [{ emoji: "🎉", role_id: "role_1" }],
            };

            await saveReactionMessage(inputDefined);
            expect(client.query.mock.calls[1][1]).toEqual(["msg_200", "chan_1", "guild_123", "REACTION", "Verify", inputDefined.message]);
        });

        it("should append id to mainParams on UPDATE path", async () => {
            const client = {
                query: vi.fn<
                    (sql: string, params?: unknown[]) => Promise<{ rows: { id?: number | string }[]; rowCount?: number }>
                >(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            client.query.mockResolvedValue({ rows: [{ id: "7" }], rowCount: 1 });

            const input: SaveReactionMessageInput = {
                id: 7,
                name: "Verify",
                guild_id: "guild_123",
                channel_id: "chan_1",
                message_id: "msg_1",
                message: { format: "TEXT", content: "Pick", embed: {} },
                mode: "BUTTON",
                buttons: [{ custom_id: "btn_1", role_id: "role_1" }],
            };

            const result = await saveReactionMessage(input);

            // Call 1 parameters should contain mainParams + id
            expect(client.query.mock.calls[1][1]).toEqual(["msg_1", "chan_1", "guild_123", "BUTTON", "Verify", input.message, 7]);
            expect(result.id).toBe(7);
        });

        it("should map reaction items into array parameters", async () => {
            const client = {
                query: vi.fn<
                    (sql: string, params?: unknown[]) => Promise<{ rows: { id?: number | string }[]; rowCount?: number }>
                >(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            client.query.mockResolvedValue({ rows: [{ id: "10" }], rowCount: 1 });

            const input: SaveReactionMessageInput = {
                name: "Verify",
                guild_id: "guild_123",
                channel_id: "chan_1",
                message: { format: "TEXT", content: "Pick", embed: {} },
                mode: "REACTION",
                reactions: [
                    { emoji: "🎉", role_id: "role_1" },
                    { emoji: "👍", role_id: "role_2" },
                ],
                buttons: [],
            };

            await saveReactionMessage(input);

            // Find query call where parameter array has length 3
            const reactionInsertParams = client.query.mock.calls.find(
                (call) => Array.isArray(call[1]) && call[1].length === 3
            )?.[1];

            expect(reactionInsertParams).toEqual([10, ["🎉", "👍"], ["role_1", "role_2"]]);
        });

        it("should map button items into array parameters and default missing style to PRIMARY", async () => {
            const client = {
                query: vi.fn<
                    (sql: string, params?: unknown[]) => Promise<{ rows: { id?: number | string }[]; rowCount?: number }>
                >(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            client.query.mockResolvedValue({ rows: [{ id: "10" }], rowCount: 1 });

            const input: SaveReactionMessageInput = {
                name: "Roles",
                guild_id: "guild_123",
                channel_id: "chan_1",
                message: { format: "TEXT", content: "Pick", embed: {} },
                mode: "BUTTON",
                reactions: [],
                buttons: [
                    { role_id: "role_1", custom_id: "btn_1", label: "Role 1", style: "SUCCESS", emoji: "🎉" },
                    { role_id: "role_2", custom_id: "btn_2", label: null, emoji: null, style: undefined },
                ],
            };

            await saveReactionMessage(input);

            // Find query call where parameters has length 6 and second item is an array
            const buttonInsertParams = client.query.mock.calls.find(
                (call) => Array.isArray(call[1]) && call[1].length === 6 && Array.isArray(call[1][1])
            )?.[1];

            expect(buttonInsertParams).toEqual([
                10,
                ["role_1", "role_2"],
                ["btn_1", "btn_2"],
                ["Role 1", null],
                ["SUCCESS", "PRIMARY"],
                ["🎉", null],
            ]);
        });

        it("should skip reaction insert when mode is BUTTON even if reactions array is populated", async () => {
            const client = {
                query: vi.fn<
                    (sql: string, params?: unknown[]) => Promise<{ rows: { id?: number | string }[]; rowCount?: number }>
                >(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            client.query.mockResolvedValue({ rows: [{ id: "10" }], rowCount: 1 });

            const input: SaveReactionMessageInput = {
                name: "Verify",
                guild_id: "guild_123",
                channel_id: "chan_1",
                message: { format: "TEXT", content: "Pick", embed: {} },
                mode: "BUTTON",
                reactions: [{ emoji: "🎉", role_id: "role_1" }],
                buttons: [{ custom_id: "btn_1", role_id: "role_1" }],
            };

            await saveReactionMessage(input);

            // No query call should have 3 parameters (reaction mapping params)
            const reactionInsertCall = client.query.mock.calls.find(
                (call) => Array.isArray(call[1]) && call[1].length === 3
            );
            expect(reactionInsertCall).toBeUndefined();
        });

        it("should skip button insert when mode is REACTION even if buttons array is populated", async () => {
            const client = {
                query: vi.fn<
                    (sql: string, params?: unknown[]) => Promise<{ rows: { id?: number | string }[]; rowCount?: number }>
                >(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            client.query.mockResolvedValue({ rows: [{ id: "10" }], rowCount: 1 });

            const input: SaveReactionMessageInput = {
                name: "Verify",
                guild_id: "guild_123",
                channel_id: "chan_1",
                message: { format: "TEXT", content: "Pick", embed: {} },
                mode: "REACTION",
                reactions: [{ emoji: "🎉", role_id: "role_1" }],
                buttons: [{ custom_id: "btn_1", role_id: "role_1" }],
            };

            await saveReactionMessage(input);

            // No query call should have 6 parameters with an array at index 1 (button mapping params)
            const buttonInsertCall = client.query.mock.calls.find(
                (call) => Array.isArray(call[1]) && call[1].length === 6 && Array.isArray(call[1][1])
            );
            expect(buttonInsertCall).toBeUndefined();
        });

        it("should roll back transaction and release client when query throws", async () => {
            const client = {
                query: vi.fn<
                    (sql: string, params?: unknown[]) => Promise<{ rows: { id?: number | string }[]; rowCount?: number }>
                >(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
            client.query.mockRejectedValueOnce(new Error("db failure"));

            await expect(
                saveReactionMessage({
                    name: "Verify",
                    guild_id: "guild_123",
                    channel_id: "chan_1",
                    message: { format: "TEXT", content: "Pick", embed: {} },
                    mode: "REACTION",
                    reactions: [{ emoji: "🎉", role_id: "role_1" }],
                })
            ).rejects.toThrow("db failure");

            expect(client.release).toHaveBeenCalled();
        });

        it("should throw error when updating a non-existent ID", async () => {
            const client = {
                query: vi.fn<
                    (sql: string, params?: unknown[]) => Promise<{ rows: { id?: number | string }[]; rowCount?: number }>
                >(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            const input: SaveReactionMessageInput = {
                id: 99,
                name: "Verify",
                guild_id: "guild_123",
                channel_id: "chan_1",
                message: { format: "TEXT", content: "Pick", embed: {} },
                mode: "BUTTON",
                buttons: [{ custom_id: "btn_1", role_id: "role_1" }],
            };

            await expect(saveReactionMessage(input)).rejects.toThrow(
                "Reaction message with ID 99 not found."
            );
            expect(client.release).toHaveBeenCalled();
        });

        it("should validate input schema before connecting to database", async () => {
            await expect(
                saveReactionMessage({
                    name: "",
                    guild_id: "guild_123",
                    channel_id: "chan_1",
                })
            ).rejects.toThrow();
            expect(mockConnect).not.toHaveBeenCalled();
        });
    });

    describe("sendReactionMessageToBackend", () => {
        it("should POST to the backend endpoint with headers", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(""),
                json: () => Promise.resolve({ message_id: "discord_msg_1" }),
            });

            const result = await sendReactionMessageToBackend("guild_123", 4);

            expect(result).toEqual({ message_id: "discord_msg_1" });
            const [url, init] = mockFetch.mock.calls[0];
            expect(url).toContain("/api/guilds/guild_123/reaction-roles/4/send");
            expect(init).toEqual({
                method: "POST",
                cache: "no-store",
                headers: new Headers({ "Content-Type": "application/json" }),
            });
        });

        it("should throw error message on response failure", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                text: () => Promise.resolve("Spicy is taking up 99.8% of available RAM"),
                json: () => Promise.resolve({}),
            });

            await expect(sendReactionMessageToBackend("guild_123", 4)).rejects.toThrow(
                "Spicy is taking up 99.8% of available RAM"
            );
        });

        it("should throw generic error when backend error text is empty", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                text: () => Promise.resolve(""),
                json: () => Promise.resolve({}),
            });

            await expect(sendReactionMessageToBackend("guild_123", 4)).rejects.toThrow(
                "Failed to dispatch reaction roles."
            );
        });
    });

    describe("deleteDiscordMessageFromBackend", () => {
        it("should send DELETE HTTP request", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(""),
                json: () => Promise.resolve({}),
            });

            await deleteDiscordMessageFromBackend("guild_123", 4);

            const [url, init] = mockFetch.mock.calls[0];
            expect(url).toContain("/api/guilds/guild_123/reaction-roles/4/message");
            expect(init?.method).toBe("DELETE");
        });

        it("should throw backend error on failure", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                text: () => Promise.resolve("not found"),
                json: () => Promise.resolve({}),
            });

            await expect(deleteDiscordMessageFromBackend("guild_123", 4)).rejects.toThrow(
                "not found"
            );
        });

        it("should throw generic fallback message when error response text is empty", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                text: () => Promise.resolve(""),
                json: () => Promise.resolve({}),
            });

            await expect(deleteDiscordMessageFromBackend("guild_123", 4)).rejects.toThrow(
                "Failed to delete Discord message."
            );
        });
    });

    describe("notifyBackendReactionMessageEdit", () => {
        it("should POST an edit notification to the backend with correct options", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(""),
                json: () => Promise.resolve({}),
            });

            await notifyBackendReactionMessageEdit("guild_123", 4);

            const [url, init] = mockFetch.mock.calls[0];
            expect(url).toContain("/api/guilds/guild_123/reaction-roles/4/edit");
            expect(init).toEqual(
                expect.objectContaining({
                    method: "POST",
                })
            );
        });

        it("should swallow errors gracefully and log to console.error", async () => {
            const err = new Error("network down");
            mockFetch.mockRejectedValue(err);

            await expect(notifyBackendReactionMessageEdit("guild_123", 4)).resolves.toBeUndefined();
            expect(console.error).toHaveBeenCalledWith(
                "Failed to auto-update Discord message on save:",
                err
            );
        });
    });
});