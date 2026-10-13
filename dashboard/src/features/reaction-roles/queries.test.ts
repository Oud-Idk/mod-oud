import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    deleteReactionMessage,
    getReactionMessageById,
    getReactionMessages,
    saveReactionMessage,
    sendReactionMessageToBackend,
    deleteDiscordMessageFromBackend,
    notifyBackendReactionMessageEdit,
} from "./queries";

// Row mapping, SQL shape, tenant scoping and constraints live in
// queries.integration.test.ts against a real database. What stays here is the
// behaviour a real database will not produce on demand: a failing connection, a
// null rowCount, a schema rejection, and the backend HTTP calls.

interface MockResponse {
    ok: boolean;
    text(): Promise<string>;
    json(): Promise<unknown>;
}

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[]; rowCount?: number | null }>>()
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
        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getReactionMessages("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("getReactionMessageById", () => {
        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getReactionMessageById(5)).rejects.toThrow("connection lost");
        });
    });

    describe("deleteReactionMessage", () => {
        it("should return false when rowCount is null", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: null });

            expect(await deleteReactionMessage(3)).toBe(false);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(deleteReactionMessage(3)).rejects.toThrow("connection lost");
        });
    });

    describe("saveReactionMessage", () => {
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

            const input = {
                id: 99,
                name: "Verify",
                guild_id: "guild_123",
                channel_id: "chan_1",
                message: { format: "TEXT", content: "Pick", embed: {} },
                mode: "BUTTON",
                buttons: [{ custom_id: "btn_1", role_id: "role_1" }],
            } as const;

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