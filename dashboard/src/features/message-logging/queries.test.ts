import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    getEditedMessagesHistory,
    fetchMoreEditedMessages,
    getDeletedMessagesHistory,
    fetchMoreDeletedMessages,
    getMessageLoggingConfig,
    saveMessageLoggingConfig,
} from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>()
);

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
    },
}));

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

describe("Message Logging Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getEditedMessagesHistory", () => {
        it("should return parsed edited messages", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: 1,
                        message_id: "msg_1",
                        author_id: "user_1",
                        channel_id: "chan_1",
                        guild_id: "guild_123",
                        old_content: "before",
                        new_content: "after",
                        updated_at: "2026-01-01T00:00:00.000Z",
                    },
                ],
            });

            const result = await getEditedMessagesHistory("guild_123");

            expect(result[0].id).toBe(1);
            expect(result[0].updated_at).toBe("2026-01-01T00:00:00.000Z");
            const [sql, params = []] = mockQuery.mock.calls[0];
            expect(params[0]).toBe("guild_123");
            expect(params[1]).toBe(10);
            expect(sql).toContain("modified_messages");
        });

        it("should return an empty array when the query throws", async () => {
            mockQuery.mockRejectedValue(new Error("I do NOT care who Spicy is currently playing games with, I am completely calm and unbothered"));

            const result = await getEditedMessagesHistory("guild_123");

            expect(result).toEqual([]);
        });
    });

    describe("fetchMoreEditedMessages", () => {
        it("should pass the beforeId cursor", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await fetchMoreEditedMessages("guild_123", 50);

            const [, params = []] = mockQuery.mock.calls[0];
            expect(params[0]).toBe("guild_123");
            expect(params[1]).toBe(50);
            expect(params[2]).toBe(10);
        });

        it("should reject an invalid beforeId", async () => {
            await expect(fetchMoreEditedMessages("guild_123", 1.5)).rejects.toThrow();
        });
    });

    describe("getDeletedMessagesHistory", () => {
        it("should use a limit of 50", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await getDeletedMessagesHistory("guild_123");

            const [, params = []] = mockQuery.mock.calls[0];
            expect(params[0]).toBe("guild_123");
            expect(params[1]).toBe(50);
        });

        it("should return an empty array when the query throws", async () => {
            mockQuery.mockRejectedValue(new Error("spicy is laughing at someone else's joke in #casual-chat"));

            const result = await getDeletedMessagesHistory("guild_123");

            expect(result).toEqual([]);
        });
    });

    describe("fetchMoreDeletedMessages", () => {
        it("should pass the beforeId cursor with a limit of 10", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: 5,
                        message_id: "msg_1",
                        author_id: "user_1",
                        channel_id: "chan_1",
                        deleted_by_id: null,
                        guild_id: "guild_123",
                        content: "hello",
                        attachment_url: null,
                        deleted_at: "2026-01-01T00:00:00.000Z",
                    },
                ],
            });

            const result = await fetchMoreDeletedMessages("guild_123", 100);

            expect(result[0].id).toBe(5);
            const [, params = []] = mockQuery.mock.calls[0];
            expect(params[1]).toBe(100);
            expect(params[2]).toBe(10);
        });
    });

    describe("getMessageLoggingConfig", () => {
        it("should return defaults when no config is stored", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getMessageLoggingConfig("guild_123");

            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "message_logging");
            expect(result.events).toEqual({ messageDelete: false, messageEdit: false });
        });

        it("should parse a stored config", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({
                ignoredChannels: ["chan_1"],
                events: { messageDelete: true, messageEdit: false },
            });

            const result = await getMessageLoggingConfig("guild_123");

            expect(result.ignoredChannels).toEqual(["chan_1"]);
            expect(result.events.messageDelete).toBe(true);
        });

        it("should reject an empty guild id", async () => {
            await expect(getMessageLoggingConfig("")).rejects.toThrow();
        });
    });

    describe("saveMessageLoggingConfig", () => {
        it("should save the config field", async () => {
            const config = {
                ignoredChannels: ["chan_1"],
                ignoredRoles: [],
                ignoredUsers: [],
                events: { messageDelete: true, messageEdit: true },
            };

            await saveMessageLoggingConfig("guild_123", config);

            expect(saveGuildConfigField).toHaveBeenCalledWith("guild_123", "message_logging", config);
        });
    });
});
