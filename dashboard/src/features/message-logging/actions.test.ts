import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import {
    saveMessageLoggingConfigAction,
    fetchMoreEditedMessagesAction,
    fetchMoreDeletedMessagesAction,
} from "./actions";
import {
    fetchMoreDeletedMessages,
    fetchMoreEditedMessages,
    saveMessageLoggingConfig,
} from "@/features/message-logging/queries";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { revalidatePath } from "next/cache";
import type { EditedMessage, DeletedMessage, MessageLoggingConfig } from "@/features/message-logging/types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/message-logging/queries", () => ({
    fetchMoreDeletedMessages: vi.fn(),
    fetchMoreEditedMessages: vi.fn(),
    saveMessageLoggingConfig: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

describe("Message Logging Action Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockUser: Awaited<ReturnType<typeof verifyGuildAccess>> = {
        id: "user_123",
        name: "Test User",
    };

    const config: MessageLoggingConfig = {
        ignoredChannels: [],
        ignoredRoles: [],
        ignoredUsers: [],
        events: { messageDelete: true, messageEdit: true },
    };

    describe("saveMessageLoggingConfigAction", () => {
        it("should verify access, save the config, and revalidate the path", async () => {
            await saveMessageLoggingConfigAction("guild_123", config);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveMessageLoggingConfig).toHaveBeenCalledWith("guild_123", config);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/message-logging");
        });

        it("should throw the underlying error message", async () => {
            vi.mocked(saveMessageLoggingConfig).mockRejectedValue(new Error("db down"));

            await expect(
                saveMessageLoggingConfigAction("guild_123", {
                    ignoredChannels: [],
                    ignoredRoles: [],
                    ignoredUsers: [],
                    events: { messageDelete: false, messageEdit: false },
                })
            ).rejects.toThrow("db down");
        });

        it("should rethrow the first zod issue message on validation errors", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveMessageLoggingConfig).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Message logging config validation failure", path: [] },
                ])
            );

            await expect(saveMessageLoggingConfigAction("guild_123", config)).rejects.toThrow(
                "Message logging config validation failure"
            );
        });

        it("should fall back to 'Validation Error' when the zod error has no issues", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveMessageLoggingConfig).mockRejectedValue(new z.ZodError([]));

            await expect(saveMessageLoggingConfigAction("guild_123", config)).rejects.toThrow(
                "Validation Error"
            );
        });
    });

    describe("fetchMoreEditedMessagesAction", () => {
        it("should return fetched edited messages", async () => {
            const rows: EditedMessage[] = [
                {
                    id: 1,
                    message_id: "msg_1",
                    author_id: "user_1",
                    channel_id: "chan_1",
                    guild_id: "guild_123",
                    old_content: null,
                    new_content: null,
                    updated_at: "2026-01-01T00:00:00.000Z",
                },
            ];
            vi.mocked(fetchMoreEditedMessages).mockResolvedValue(rows);

            const result = await fetchMoreEditedMessagesAction("guild_123", 50);

            expect(fetchMoreEditedMessages).toHaveBeenCalledWith("guild_123", 50);
            expect(result).toEqual(rows);
        });

        it("should return an empty array on error", async () => {
            vi.mocked(fetchMoreEditedMessages).mockRejectedValue(new Error("db down"));

            const result = await fetchMoreEditedMessagesAction("guild_123", 50);

            expect(result).toEqual([]);
        });

        it("should reject an invalid beforeId", async () => {
            await expect(fetchMoreEditedMessagesAction("guild_123", 1.5)).resolves.toEqual([]);
            expect(fetchMoreEditedMessages).not.toHaveBeenCalled();
        });
    });

    describe("fetchMoreDeletedMessagesAction", () => {
        it("should return fetched deleted messages", async () => {
            const rows: DeletedMessage[] = [
                {
                    id: 1,
                    message_id: "msg_1",
                    author_id: "user_1",
                    channel_id: "chan_1",
                    deleted_by_id: null,
                    guild_id: "guild_123",
                    content: "hello",
                    attachment_url: null,
                    deleted_at: "2026-01-01T00:00:00.000Z",
                },
            ];
            vi.mocked(fetchMoreDeletedMessages).mockResolvedValue(rows);

            const result = await fetchMoreDeletedMessagesAction("guild_123", 100);

            expect(fetchMoreDeletedMessages).toHaveBeenCalledWith("guild_123", 100);
            expect(result).toEqual(rows);
        });

        it("should return an empty array on error", async () => {
            vi.mocked(fetchMoreDeletedMessages).mockRejectedValue(new Error("db down"));

            const result = await fetchMoreDeletedMessagesAction("guild_123", 100);

            expect(result).toEqual([]);
        });
    });
});
