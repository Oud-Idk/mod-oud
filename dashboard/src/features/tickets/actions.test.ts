import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    getTicketsListAction,
    getTicketHistoryAction,
    sendTicketMessageAction,
    deleteTicketMessageAction,
    saveTicketsConfigAction,
} from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import {
    getTicketConfig,
    saveTicketConfig,
    getTicketList,
    getTicketHistory,
} from "./queries";
import { revalidatePath } from "next/cache";
import { TicketConfigSchema, TicketHistorySchema, TicketSchema } from "@/features/tickets/types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

// Changed from "@/features/tickets/queries" to match the import path used in the files
vi.mock("./queries", () => ({
    getTicketList: vi.fn(),
    getTicketHistory: vi.fn(),
    getTicketConfig: vi.fn(),
    saveTicketConfig: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Ticket Server Actions", () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.resetAllMocks();
        process.env = { ...originalEnv };
        vi.spyOn(console, "error").mockImplementation(() => {return});
    });

    afterEach(() => {
        vi.restoreAllMocks();
        process.env = originalEnv;
    });

    describe("saveTicketsConfigAction", () => {
        it("should verify access and save valid configuration", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});
            vi.mocked(saveTicketConfig).mockResolvedValue(undefined);

            const validDraftConfig = {
                enabled: false,
                categoryId: null,
                channelId: null,
                ticketRoleId: null,
            };

            await saveTicketsConfigAction("guild_123", validDraftConfig);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveTicketConfig).toHaveBeenCalledWith("guild_123", expect.anything());
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/tickets");
        });

        it("should REJECT save and throw friendly Zod message when enabled = true but category is null", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});

            const invalidConfig = {
                enabled: true,
                categoryId: null,
                channelId: "chan_123",
                ticketRoleId: "role_123",
            };

            await expect(
                saveTicketsConfigAction("guild_123", invalidConfig)
            ).rejects.toThrow("Please select a Discord Category for tickets!");

            expect(saveTicketConfig).not.toHaveBeenCalled();
        });

        it("should REJECT if verifyGuildAccess throws unauthorized error", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Unauthorized access!"));

            await expect(
                saveTicketsConfigAction("unauthorized_guild", {})
            ).rejects.toThrow("Unauthorized access!");
        });

        it("should catch non-Zod DB error and throw generic error message", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});
            vi.mocked(saveTicketConfig).mockRejectedValue(new Error("Database write error"));

            const validDraftConfig = { enabled: false };

            await expect(
                saveTicketsConfigAction("guild_123", validDraftConfig)
            ).rejects.toThrow("Database write error");
        });

        it("should throw fallback error string if non-Error exception is thrown", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});
            vi.mocked(saveTicketConfig).mockRejectedValue("string exception");

            await expect(
                saveTicketsConfigAction("guild_123", { enabled: false })
            ).rejects.toThrow("Could not save configuration.");
        });
    });

    describe("sendTicketMessageAction", () => {
        it("should call Discord bot backend, save message_id, and revalidate path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});
            vi.mocked(getTicketConfig).mockResolvedValue(TicketConfigSchema.parse({
                enabled: true,
                categoryId: "cat_1",
                channelId: "chan_1",
                ticketRoleId: "role_1",
                postedMessageId: null,
            }));

            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: async () => ({ message_id: "discord_msg_999" }),
            });

            const returnedMessageId = await sendTicketMessageAction("guild_123", "chan_1");

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining("/api/guilds/guild_123/tickets/send-message"),
                expect.objectContaining({
                    method: "POST",
                    body: JSON.stringify({ channel_id: "chan_1" }),
                })
            );
            expect(saveTicketConfig).toHaveBeenCalledWith("guild_123", expect.objectContaining({
                postedMessageId: "discord_msg_999",
            }));
            expect(returnedMessageId).toBe("discord_msg_999");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/tickets");
        });

        it("should throw error if the Discord bot backend responds with HTTP error text", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});

            mockFetch.mockResolvedValueOnce({
                ok: false,
                text: async () => "Bot missing permissions in channel!",
            });

            await expect(
                sendTicketMessageAction("guild_123", "chan_1")
            ).rejects.toThrow("Bot missing permissions in channel!");
        });

        it("should throw fallback message if backend returns empty error text", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});

            mockFetch.mockResolvedValueOnce({
                ok: false,
                text: async () => "",
            });

            await expect(
                sendTicketMessageAction("guild_123", "chan_1")
            ).rejects.toThrow("Could not instruct the bot to send the message.");
        });

        it("should catch network errors when fetch rejects", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});
            mockFetch.mockRejectedValueOnce(new Error("Network connection reset"));

            await expect(
                sendTicketMessageAction("guild_123", "chan_1")
            ).rejects.toThrow("Network connection reset");
        });

        it("should respect BACKEND_INTERNAL_URL if configured", async () => {
            process.env.BACKEND_INTERNAL_URL = "http://backend-service:5000";
            vi.mocked(verifyGuildAccess).mockResolvedValue({});
            vi.mocked(getTicketConfig).mockResolvedValue(TicketConfigSchema.parse({
                enabled: true,
                categoryId: "cat_1",
                channelId: "chan_1",
                ticketRoleId: "role_1",
                postedMessageId: null,
            }));
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => ({ message_id: "discord_msg_env" }),
            });
            vi.mocked(saveTicketConfig).mockResolvedValue(undefined);

            await sendTicketMessageAction("guild_123", "chan_1");

            expect(mockFetch).toHaveBeenCalledWith(
                "http://backend-service:5000/api/guilds/guild_123/tickets/send-message",
                expect.anything()
            );
        });

        it("should throw fallback message when a non-Error exception occurs", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});
            mockFetch.mockRejectedValueOnce("string failure");

            await expect(
                sendTicketMessageAction("guild_123", "chan_1")
            ).rejects.toThrow("Could not post ticket panel.");
        });

        it("should propagate a DB error while persisting the posted message", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});
            vi.mocked(getTicketConfig).mockResolvedValue(TicketConfigSchema.parse({
                enabled: true,
                categoryId: "cat_1",
                channelId: "chan_1",
                ticketRoleId: "role_1",
                postedMessageId: null,
            }));
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => ({ message_id: "discord_msg_999" }),
            });
            vi.mocked(saveTicketConfig).mockRejectedValue(new Error("db write failed"));

            await expect(
                sendTicketMessageAction("guild_123", "chan_1")
            ).rejects.toThrow("db write failed");
            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });

    describe("deleteTicketMessageAction", () => {
        it("should instruct bot to delete message and reset postedMessageId in DB", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});
            vi.mocked(getTicketConfig).mockResolvedValue(TicketConfigSchema.parse({
                enabled: true,
                categoryId: "cat_1",
                channelId: "chan_1",
                ticketRoleId: "role_1",
                postedMessageId: "discord_msg_999",
            }));

            mockFetch.mockResolvedValueOnce({
                ok: true,
            });

            await deleteTicketMessageAction("guild_123", "chan_1", "discord_msg_999");

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining("/api/guilds/guild_123/tickets/delete-message"),
                expect.objectContaining({
                    method: "POST",
                    body: JSON.stringify({ channel_id: "chan_1", message_id: "discord_msg_999" }),
                })
            );
            expect(saveTicketConfig).toHaveBeenCalledWith("guild_123", expect.objectContaining({
                postedMessageId: null,
            }));
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/tickets");
        });

        it("should throw error if backend returns error during message deletion", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});

            mockFetch.mockResolvedValueOnce({
                ok: false,
                text: async () => "Message already deleted",
            });

            await expect(
                deleteTicketMessageAction("guild_123", "chan_1", "msg_999")
            ).rejects.toThrow("Message already deleted");
        });

        it("should throw default message when backend response text is empty on deletion error", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});

            mockFetch.mockResolvedValueOnce({
                ok: false,
                text: () => "",
            });

            await expect(
                deleteTicketMessageAction("guild_123", "chan_1", "msg_999")
            ).rejects.toThrow("Could not instruct the bot to delete the message.");
        });

        it("should throw fallback message when a non-Error exception occurs", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});
            mockFetch.mockRejectedValueOnce("string failure");

            await expect(
                deleteTicketMessageAction("guild_123", "chan_1", "msg_999")
            ).rejects.toThrow("Could not delete ticket panel.");
        });

        it("should propagate a DB error while clearing postedMessageId", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});
            vi.mocked(getTicketConfig).mockResolvedValue(TicketConfigSchema.parse({
                enabled: true,
                categoryId: "cat_1",
                channelId: "chan_1",
                ticketRoleId: "role_1",
                postedMessageId: "discord_msg_999",
            }));
            mockFetch.mockResolvedValueOnce({ ok: true });
            vi.mocked(saveTicketConfig).mockRejectedValue(new Error("db write failed"));

            await expect(
                deleteTicketMessageAction("guild_123", "chan_1", "msg_999")
            ).rejects.toThrow("db write failed");
            expect(revalidatePath).not.toHaveBeenCalled();
        });
    });

    describe("Read-only Action Wrappers", () => {
        it("getTicketsListAction should verify guild access and return rows", async () => {
            // Populated to satisfy constraints in TicketSchema
            const mockRows = [
                TicketSchema.parse({
                    id: 1,
                    status: "OPEN",
                    channel_id: "chan_123",
                    opener_id: "user_123",
                    created_at: "2026-01-01T00:00:00.000Z",
                    closed_at: "2026-01-02T00:00:00.000Z",
                }),
            ];
            vi.mocked(verifyGuildAccess).mockResolvedValue({});
            vi.mocked(getTicketList).mockResolvedValue(mockRows);

            const result = await getTicketsListAction("guild_123");

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(result).toEqual(mockRows);
        });

        it("getTicketsListAction should catch errors and throw friendly error message", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Access denied"));

            await expect(getTicketsListAction("guild_123")).rejects.toThrow(
                "Could not retrieve tickets list."
            );
        });

        it("getTicketHistoryAction should verify guild access and return history", async () => {
            // Populated to satisfy constraints in TicketHistorySchema
            const mockHistory = TicketHistorySchema.parse({
                ticket_id: 1,
                guild_id: "guild_123",
                channel_id: "chan_123",
                opener_id: "user_123",
                status: "OPEN",
                created_at: "2026-01-01T00:00:00.000Z",
                closed_at: "2026-01-02T00:00:00.000Z",
                last_activity: "2026-01-03T00:00:00.000Z",
            });
            vi.mocked(verifyGuildAccess).mockResolvedValue({});
            vi.mocked(getTicketHistory).mockResolvedValue(mockHistory);

            const result = await getTicketHistoryAction("guild_123", "chan_123");

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(result).toEqual(mockHistory);
        });

        it("getTicketHistoryAction should catch errors and throw friendly error message", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue({});
            vi.mocked(getTicketHistory).mockRejectedValue(new Error("Database error"));

            await expect(getTicketHistoryAction("guild_123", "chan_123")).rejects.toThrow(
                "Could not retrieve ticket history."
            );
        });
    });
});