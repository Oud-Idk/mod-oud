import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { sendEmbedAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { isEmbedEmpty } from "@/features/_shared/embed";
import { config } from "@/config";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/_shared/embed", async () => {
    const { z } = await import("zod");
    return {
        DiscordEmbedSchema: z.object({
            title: z.string().optional(),
            description: z.string().optional(),
        }),
        isEmbedEmpty: vi.fn(),
    };
});

describe("sendEmbedAction", () => {
    const originalBackend = config.backendInternalUrl;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        config.backendInternalUrl = originalBackend;
        vi.restoreAllMocks();
    });

    const validGuildId = "guild-123";
    const validPayload = {
        channelId: "channel-456",
        embedState: { title: "Hello World", description: "Test embed description" },
    };

    describe("Server Action Logic", () => {
        it("should send embed successfully and return messageId", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});

            const mockResponseBody = { message_id: "msg-789" };
            vi.spyOn(global, "fetch").mockResolvedValueOnce(
                new Response(JSON.stringify(mockResponseBody), {
                    status: 200,
                    headers: { "Content-Type": "application/json" },
                })
            );

            const result = await sendEmbedAction(validGuildId, validPayload);

            expect(verifyGuildAccess).toHaveBeenCalledWith(validGuildId);
            expect(global.fetch).toHaveBeenCalledWith(
                "http://localhost:8080/api/guilds/guild-123/embeds/send",
                {
                    method: "POST",
                    cache: "no-store",
                    headers: new Headers({
                        "Content-Type": "application/json",
                    }),
                    body: JSON.stringify({
                        channel_id: "channel-456",
                        content: null,
                        embed: validPayload.embedState,
                        format: "EMBED",
                    }),
                }
            );
            expect(result).toEqual({ messageId: "msg-789" });
        });

        it("should respect process.env.BACKEND_INTERNAL_URL if configured", async () => {
            config.backendInternalUrl = "http://backend-service:5000";
            vi.mocked(verifyGuildAccess).mockResolvedValue({});

            vi.spyOn(global, "fetch").mockResolvedValueOnce(
                new Response(JSON.stringify({ message_id: "msg-789" }), { status: 200 })
            );

            await sendEmbedAction(validGuildId, validPayload);

            expect(global.fetch).toHaveBeenCalledWith(
                "http://backend-service:5000/api/guilds/guild-123/embeds/send",
                expect.any(Object)
            );
        });

        it("should throw error if backend returns an HTTP error status", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});

            vi.spyOn(global, "fetch").mockResolvedValueOnce(
                new Response("spicy begged for treats instead of returning a valid 200 OK", { status: 403 })
            );

            await expect(
                sendEmbedAction(validGuildId, validPayload)
            ).rejects.toThrow("spicy begged for treats instead of returning a valid 200 OK");
        });

        it("should throw fallback error if backend returns error with empty text", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});

            vi.spyOn(global, "fetch").mockResolvedValueOnce(
                new Response("", { status: 500 })
            );

            await expect(
                sendEmbedAction(validGuildId, validPayload)
            ).rejects.toThrow("Backend returned an error state.");
        });

        it("should throw network failure error if fetch rejects", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});

            vi.spyOn(global, "fetch").mockRejectedValueOnce(
                new TypeError("Failed to fetch")
            );

            await expect(
                sendEmbedAction(validGuildId, validPayload)
            ).rejects.toThrow("Failed to fetch");
        });

        it("should throw default message on non-Error exception", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValueOnce("Unknown error");

            await expect(
                sendEmbedAction(validGuildId, validPayload)
            ).rejects.toThrow("Failed to communicate with the backend server.");
        });

        it("should propagate an Error thrown by verifyGuildAccess", async () => {
            vi.spyOn(global, "fetch");
            vi.mocked(verifyGuildAccess).mockRejectedValueOnce(new Error("Access denied"));

            await expect(sendEmbedAction(validGuildId, validPayload)).rejects.toThrow("Access denied");
            expect(global.fetch).not.toHaveBeenCalled();
        });

        it("should rethrow the first zod issue message when verifyGuildAccess rejects with a ZodError", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Embed send validation failure", path: [] },
                ])
            );

            await expect(sendEmbedAction(validGuildId, validPayload)).rejects.toThrow(
                "Embed send validation failure"
            );
        });

    });

    describe("Validation Handling (Zod Integration)", () => {
        it("should throw validation error when guildId is empty", async () => {
            await expect(sendEmbedAction("", validPayload)).rejects.toThrow(
                "Guild ID is required"
            );
        });

        it("should throw validation error when channelId is empty", async () => {
            const invalidPayload = { ...validPayload, channelId: "" };

            await expect(
                sendEmbedAction(validGuildId, invalidPayload)
            ).rejects.toThrow("Channel ID is required");
        });

        it("should throw validation error when embed is empty", async () => {
            vi.mocked(isEmbedEmpty).mockReturnValue(true);

            await expect(
                sendEmbedAction(validGuildId, validPayload)
            ).rejects.toThrow(
                "Embed must have at least a title, description, or visible content!"
            );
        });
    });
});