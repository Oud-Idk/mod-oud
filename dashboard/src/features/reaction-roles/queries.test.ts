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
        it("should parse rows into reaction messages", async () => {
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
            expect(result[0].reactions[0].emoji).toBe("🎉");
            const params = mockQuery.mock.calls[0][1];
            expect(params).toEqual(["guild_123"]);
        });
    });

    describe("getReactionMessageById", () => {
        it("should return the parsed message", async () => {
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
            expect(result?.buttons[0].custom_id).toBe("btn_1");
        });

        it("should return null when no row matches", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            const result = await getReactionMessageById(999);

            expect(result).toBeNull();
        });
    });

    describe("deleteReactionMessage", () => {
        it("should return true when exactly one row was deleted", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

            const result = await deleteReactionMessage(3);

            expect(result).toBe(true);
            const params = mockQuery.mock.calls[0][1];
            expect(params).toEqual([3]);
        });

        it("should return false when nothing was deleted", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            const result = await deleteReactionMessage(3);

            expect(result).toBe(false);
        });
    });

    describe("saveReactionMessage", () => {
        it("should insert a new reaction message within a transaction", async () => {
            const client = {
                query: vi.fn<
                    (sql: string, params?: unknown[]) => Promise<{ rows: { id?: number | string }[]; rowCount?: number }>
                >(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
            client.query.mockResolvedValueOnce({ rows: [{ id: "10" }], rowCount: 1 });
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

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

            expect(mockConnect).toHaveBeenCalled();
            expect(client.query).toHaveBeenCalledWith("BEGIN");
            expect(client.query).toHaveBeenCalledWith("COMMIT");
            expect(client.release).toHaveBeenCalled();
            expect(result.id).toBe(10);
        });

        it("should update an existing message when an id is present", async () => {
            const client = {
                query: vi.fn<
                    (sql: string, params?: unknown[]) => Promise<{ rows: { id?: number | string }[]; rowCount?: number }>
                >(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
            client.query.mockResolvedValueOnce({ rows: [{ id: "7" }], rowCount: 1 });
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });

            const input: SaveReactionMessageInput = {
                id: 7,
                name: "Verify",
                guild_id: "guild_123",
                channel_id: "chan_1",
                message: { format: "TEXT", content: "Pick", embed: {} },
                mode: "BUTTON",
                buttons: [{ role_id: "role_1", custom_id: "btn_1" }],
                reactions: [],
            };

            const result = await saveReactionMessage(input);

            expect(client.query.mock.calls[1][0]).toContain("UPDATE reaction_messages");
            expect(client.query).toHaveBeenCalledWith("COMMIT");
            expect(result.id).toBe(7);
        });

        it("should roll back and release when the query throws", async () => {
            const client = {
                query: vi.fn<
                    (sql: string, params?: unknown[]) => Promise<{ rows: { id?: number | string }[]; rowCount?: number }>
                >(),
                release: vi.fn(),
            };
            mockConnect.mockResolvedValue(client);
            client.query.mockResolvedValueOnce({ rows: [], rowCount: 1 });
            client.query.mockRejectedValueOnce(new Error("constraint violation"));

            await expect(
                saveReactionMessage({
                    name: "Verify",
                    guild_id: "guild_123",
                    channel_id: "chan_1",
                    message: { format: "TEXT", content: "Pick", embed: {} },
                    mode: "REACTION",
                    reactions: [{ emoji: "🎉", role_id: "role_1" }],
                })
            ).rejects.toThrow("constraint violation");

            expect(client.query).toHaveBeenCalledWith("ROLLBACK");
            expect(client.release).toHaveBeenCalled();
        });

        it("should throw a validation error for invalid input", async () => {
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
        it("should POST to the backend and return the message id", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(""),
                json: () => Promise.resolve({ message_id: "discord_msg_1" }),
            });

            const result = await sendReactionMessageToBackend("guild_123", 4);

            expect(result).toEqual({ message_id: "discord_msg_1" });
            const url = mockFetch.mock.calls[0][0];
            expect(url).toContain("/api/guilds/guild_123/reaction-roles/4/send");
        });

        it("should throw when the backend responds with an error body", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                text: () => Promise.resolve("backend error"),
                json: () => Promise.resolve({}),
            });

            await expect(sendReactionMessageToBackend("guild_123", 4)).rejects.toThrow(
                "backend error"
            );
        });

        it("should throw a generic message when the backend error body is empty", async () => {
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
        it("should DELETE the Discord message on the backend", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(""),
                json: () => Promise.resolve({}),
            });

            await deleteDiscordMessageFromBackend("guild_123", 4);

            const url = mockFetch.mock.calls[0][0];
            expect(url).toContain("/api/guilds/guild_123/reaction-roles/4/message");
            const init = mockFetch.mock.calls[0][1];
            expect(init?.method).toBe("DELETE");
        });

        it("should throw when the backend responds with an error", async () => {
            mockFetch.mockResolvedValue({
                ok: false,
                text: () => Promise.resolve("not found"),
                json: () => Promise.resolve({}),
            });

            await expect(deleteDiscordMessageFromBackend("guild_123", 4)).rejects.toThrow(
                "not found"
            );
        });
    });

    describe("notifyBackendReactionMessageEdit", () => {
        it("should POST an edit notification to the backend", async () => {
            mockFetch.mockResolvedValue({
                ok: true,
                text: () => Promise.resolve(""),
                json: () => Promise.resolve({}),
            });

            await notifyBackendReactionMessageEdit("guild_123", 4);

            const url = mockFetch.mock.calls[0][0];
            expect(url).toContain("/api/guilds/guild_123/reaction-roles/4/edit");
        });

        it("should swallow backend failures", async () => {
            mockFetch.mockRejectedValue(new Error("network down"));

            await expect(notifyBackendReactionMessageEdit("guild_123", 4)).resolves.toBeUndefined();
        });
    });
});
