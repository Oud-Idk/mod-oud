import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendEmbedAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Embed Builder Server Actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("should send embed action successfully", async () => {
        vi.mocked(verifyGuildAccess).mockResolvedValue({
            id: "user_123",
            name: "Test User",
        });

        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({ message_id: "msg_123456" }),
        });

        const result = await sendEmbedAction("guild_123", {
            channelId: "chan_456",
            embedState: { title: "Announcement" },
        });

        expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
        expect(mockFetch).toHaveBeenCalledWith(
            "http://localhost:8080/api/guilds/guild_123/embeds/send",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    channel_id: "chan_456",
                    content: null,
                    embed: { title: "Announcement" },
                    format: "EMBED",
                }),
            })
        );
        expect(result).toEqual({
            success: true,
            messageId: "msg_123456",
        });
    });

    it("should return failure if Zod validation fails (empty embed)", async () => {
        const result = await sendEmbedAction("guild_123", {
            channelId: "chan_456",
            embedState: {}, // Empty embed
        });

        expect(verifyGuildAccess).not.toHaveBeenCalled();
        expect(result).toEqual({
            success: false,
            error: "Embed must have at least a title, description, or visible content!",
        });
    });

    it("should return failure if user access verification fails", async () => {
        vi.mocked(verifyGuildAccess).mockRejectedValueOnce(
            new Error("Unauthorized guild access.")
        );

        const result = await sendEmbedAction("guild_123", {
            channelId: "chan_456",
            embedState: { title: "Test" },
        });

        expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
        expect(mockFetch).not.toHaveBeenCalled();
        expect(result).toEqual({
            success: false,
            error: "Unauthorized guild access.",
        });
    });

    it("should handle non-OK backend HTTP response", async () => {
        vi.mocked(verifyGuildAccess).mockResolvedValue({
            id: "user_123",
            name: "Test User",
        });

        mockFetch.mockResolvedValueOnce({
            ok: false,
            text: async () => "Missing Permissions to send message in channel",
        });

        const result = await sendEmbedAction("guild_123", {
            channelId: "chan_456",
            embedState: { title: "Test" },
        });

        expect(result).toEqual({
            success: false,
            error: "Missing Permissions to send message in channel",
        });
    });
});