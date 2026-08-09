import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    saveReactionMessageAction,
    deleteReactionMessageAction,
    sendReactionMessageAction,
    deleteReactionDiscordMessageAction,
} from "./actions";
import {
    saveReactionMessage,
    deleteReactionMessage,
    getReactionMessageById,
    sendReactionMessageToBackend,
    deleteDiscordMessageFromBackend,
    notifyBackendReactionMessageEdit,
} from "./queries";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { revalidatePath } from "next/cache";
import type { ReactionMessage, SaveReactionMessageInput } from "./types";

const mockScan = vi.hoisted(() => vi.fn<() => Promise<[string, string[]]>>());
const mockDel = vi.hoisted(() => vi.fn<() => Promise<number>>());

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("./queries", () => ({
    saveReactionMessage: vi.fn(),
    deleteReactionMessage: vi.fn(),
    getReactionMessageById: vi.fn(),
    sendReactionMessageToBackend: vi.fn(),
    deleteDiscordMessageFromBackend: vi.fn(),
    notifyBackendReactionMessageEdit: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
    default: {
        scan: mockScan,
        del: mockDel,
    },
}));

const validInput: SaveReactionMessageInput = {
    name: "Verify",
    guild_id: "guild_123",
    channel_id: "chan_1",
    message: { format: "TEXT", content: "Pick a role", embed: {} },
    mode: "REACTION",
    reactions: [{ emoji: "🎉", role_id: "role_1" }],
};

function messageFixture(overrides: Partial<ReactionMessage> = {}): ReactionMessage {
    return {
        id: 1,
        name: "Verify",
        guild_id: "guild_123",
        channel_id: "chan_1",
        message_id: "discord_msg_1",
        mode: "REACTION",
        message: { format: "TEXT", content: "Pick a role", embed: {} },
        content: "",
        reactions: [{ emoji: "🎉", role_id: "role_1" }],
        buttons: [],
        ...overrides,
    };
}

describe("Reaction Roles Action Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("saveReactionMessageAction", () => {
        it("should verify access, save, invalidate cache, notify backend, and revalidate", async () => {
            const saved = messageFixture();
            vi.mocked(saveReactionMessage).mockResolvedValue(saved);
            mockScan.mockResolvedValue(["0", ["key1", "key2"]]);

            const result = await saveReactionMessageAction("guild_123", validInput);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveReactionMessage).toHaveBeenCalled();
            expect(mockScan).toHaveBeenCalledWith("0", "MATCH", "reaction_role:discord_msg_1:*", "COUNT", 100);
            expect(mockDel).toHaveBeenCalledWith("key1", "key2");
            expect(notifyBackendReactionMessageEdit).toHaveBeenCalledWith("guild_123", 1);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/reaction-roles");
            expect(result).toEqual(saved);
        });

        it("should skip cache invalidation when the saved message has no message_id", async () => {
            const saved = messageFixture({ message_id: null });
            vi.mocked(saveReactionMessage).mockResolvedValue(saved);

            await saveReactionMessageAction("guild_123", validInput);

            expect(mockScan).not.toHaveBeenCalled();
            expect(notifyBackendReactionMessageEdit).not.toHaveBeenCalled();
        });

        it("should throw the first zod issue message for invalid input", async () => {
            const invalid: SaveReactionMessageInput = {
                name: "Verify",
                guild_id: "guild_123",
                channel_id: "chan_1",
                mode: "REACTION",
                reactions: [],
            };

            await expect(saveReactionMessageAction("guild_123", invalid)).rejects.toThrow(
                "At least one reaction mapping is required."
            );
            expect(saveReactionMessage).not.toHaveBeenCalled();
        });

        it("should throw the underlying error message", async () => {
            vi.mocked(saveReactionMessage).mockRejectedValue(new Error("db down"));

            await expect(saveReactionMessageAction("guild_123", validInput)).rejects.toThrow("db down");
        });

        it("should throw a generic message when a non-error is thrown", async () => {
            vi.mocked(saveReactionMessage).mockRejectedValue("boom");

            await expect(saveReactionMessageAction("guild_123", validInput)).rejects.toThrow(
                "Could not save message."
            );
        });

        it("should scan multiple pages of cache keys before deleting", async () => {
            vi.mocked(saveReactionMessage).mockResolvedValue(messageFixture());
            mockScan.mockResolvedValueOnce(["1", ["key1"]]).mockResolvedValueOnce(["0", ["key2"]]);

            await saveReactionMessageAction("guild_123", validInput);

            expect(mockScan).toHaveBeenCalledTimes(2);
            expect(mockDel).toHaveBeenCalledWith("key1", "key2");
        });

        it("should swallow errors while scanning the cache", async () => {
            vi.mocked(saveReactionMessage).mockResolvedValue(messageFixture());
            mockScan.mockRejectedValue(new Error("redis down"));

            await expect(saveReactionMessageAction("guild_123", validInput)).resolves.toBeDefined();
        });

        it("should swallow errors while deleting cache keys", async () => {
            vi.mocked(saveReactionMessage).mockResolvedValue(messageFixture());
            mockScan.mockResolvedValue(["0", ["key1"]]);
            mockDel.mockRejectedValue(new Error("redis down"));

            await expect(saveReactionMessageAction("guild_123", validInput)).resolves.toBeDefined();
        });
    });

    describe("deleteReactionMessageAction", () => {
        it("should fetch the message, delete it, invalidate the cache, and revalidate", async () => {
            vi.mocked(getReactionMessageById).mockResolvedValue(messageFixture());
            vi.mocked(deleteReactionMessage).mockResolvedValue(true);
            mockScan.mockResolvedValue(["0", ["key1"]]);

            const result = await deleteReactionMessageAction("guild_123", 1);

            expect(deleteReactionMessage).toHaveBeenCalledWith(1);
            expect(mockDel).toHaveBeenCalledWith("key1");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/reaction-roles");
            expect(result).toBe(true);
        });

        it("should skip cache invalidation when the message has no message_id", async () => {
            vi.mocked(getReactionMessageById).mockResolvedValue(messageFixture({ message_id: null }));
            vi.mocked(deleteReactionMessage).mockResolvedValue(false);

            const result = await deleteReactionMessageAction("guild_123", 1);

            expect(mockScan).not.toHaveBeenCalled();
            expect(result).toBe(false);
        });

        it("should throw the underlying error message", async () => {
            vi.mocked(getReactionMessageById).mockRejectedValue(new Error("db down"));

            await expect(deleteReactionMessageAction("guild_123", 1)).rejects.toThrow("db down");
        });

        it("should throw a generic message when a non-error is thrown", async () => {
            vi.mocked(getReactionMessageById).mockRejectedValue("boom");

            await expect(deleteReactionMessageAction("guild_123", 1)).rejects.toThrow(
                "Could not delete reaction message."
            );
        });
    });

    describe("sendReactionMessageAction", () => {
        it("should dispatch the message, invalidate the cache, and revalidate", async () => {
            vi.mocked(sendReactionMessageToBackend).mockResolvedValue({
                message_id: "discord_msg_1",
            });
            mockScan.mockResolvedValue(["0", ["key1"]]);

            const result = await sendReactionMessageAction("guild_123", 1);

            expect(sendReactionMessageToBackend).toHaveBeenCalledWith("guild_123", 1);
            expect(mockDel).toHaveBeenCalledWith("key1");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/reaction-roles");
            expect(result).toEqual({ message_id: "discord_msg_1" });
        });

        it("should throw the underlying error message", async () => {
            vi.mocked(sendReactionMessageToBackend).mockRejectedValue(new Error("backend down"));

            await expect(sendReactionMessageAction("guild_123", 1)).rejects.toThrow("backend down");
        });

        it("should throw a generic message when a non-error is thrown", async () => {
            vi.mocked(sendReactionMessageToBackend).mockRejectedValue("boom");

            await expect(sendReactionMessageAction("guild_123", 1)).rejects.toThrow(
                "An unexpected error occurred."
            );
        });
    });

    describe("deleteReactionDiscordMessageAction", () => {
        it("should delete the Discord message, invalidate the cache, and revalidate", async () => {
            vi.mocked(getReactionMessageById).mockResolvedValue(messageFixture());
            vi.mocked(deleteDiscordMessageFromBackend).mockResolvedValue(undefined);
            mockScan.mockResolvedValue(["0", ["key1"]]);

            const result = await deleteReactionDiscordMessageAction("guild_123", 1);

            expect(deleteDiscordMessageFromBackend).toHaveBeenCalledWith("guild_123", 1);
            expect(mockDel).toHaveBeenCalledWith("key1");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/reaction-roles");
            expect(result).toEqual({ success: true });
        });

        it("should skip cache invalidation when the message has no message_id", async () => {
            vi.mocked(getReactionMessageById).mockResolvedValue(messageFixture({ message_id: null }));
            vi.mocked(deleteDiscordMessageFromBackend).mockResolvedValue(undefined);

            const result = await deleteReactionDiscordMessageAction("guild_123", 1);

            expect(mockScan).not.toHaveBeenCalled();
            expect(result).toEqual({ success: true });
        });

        it("should throw the underlying error message", async () => {
            vi.mocked(deleteDiscordMessageFromBackend).mockRejectedValue(new Error("not found"));

            await expect(deleteReactionDiscordMessageAction("guild_123", 1)).rejects.toThrow(
                "not found"
            );
        });

        it("should throw a generic message when a non-error is thrown", async () => {
            vi.mocked(deleteDiscordMessageFromBackend).mockRejectedValue("boom");

            await expect(deleteReactionDiscordMessageAction("guild_123", 1)).rejects.toThrow(
                "An unexpected error occurred."
            );
        });
    });
});
