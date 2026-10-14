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

// Row mapping, SQL shape, tenant scoping, ordering and limits live in
// queries.integration.test.ts against a real database. What stays here is the
// behaviour a real database will not produce on demand: the error swallow and
// the input validation that skips the query.

describe("Message Logging Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getEditedMessagesHistory", () => {
        it("should return an empty array when the query throws", async () => {
            mockQuery.mockRejectedValue(new Error("I do NOT care who Spicy is currently playing games with, I am completely calm and unbothered"));

            const result = await getEditedMessagesHistory("guild_123");

            expect(result).toEqual([]);
        });
    });

    describe("fetchMoreEditedMessages", () => {
        it("should reject an invalid beforeId", async () => {
            await expect(fetchMoreEditedMessages("guild_123", 1.5)).rejects.toThrow();
        });
    });

    describe("getDeletedMessagesHistory", () => {
        it("should return an empty array when the query throws", async () => {
            mockQuery.mockRejectedValue(new Error("spicy is laughing at someone else's joke in #casual-chat"));

            const result = await getDeletedMessagesHistory("guild_123");

            expect(result).toEqual([]);
        });
    });

    describe("fetchMoreDeletedMessages", () => {
        it("should return an empty array when the query throws", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            const result = await fetchMoreDeletedMessages("guild_123", 100);

            expect(result).toEqual([]);
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
