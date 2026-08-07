import { describe, it, expect, vi, beforeEach } from "vitest";
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

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/tickets/queries", () => ({
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
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("saveTicketsConfigAction", () => {
        it("should verify access and save valid configuration", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(true as any);
            vi.mocked(saveTicketConfig).mockResolvedValue(undefined);

            const validDraftConfig: any = {
                enabled: false,
                categoryId: null,
                channelId: null,
                ticketRoleId: null,
            };

            await saveTicketsConfigAction("guild_123", validDraftConfig);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveTicketConfig).toHaveBeenCalledWith("guild_123", expect.anything());
            expect(revalidatePath).toHaveBeenCalled();
        });

        it("should REJECT save and throw friendly Zod message when enabled = true but category is null", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(true as any);

            const invalidConfig: any = {
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
                saveTicketsConfigAction("unauthorized_guild", {} as any)
            ).rejects.toThrow("Unauthorized access!");
        });
    });

    describe("sendTicketMessageAction", () => {
        it("should call Discord bot backend, save message_id, and revalidate path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(true as any);
            vi.mocked(getTicketConfig).mockResolvedValue({
                enabled: true,
                categoryId: "cat_1",
                channelId: "chan_1",
                ticketRoleId: "role_1",
                postedMessageId: null,
            } as any);

            // Mock successful response from Rust backend bot
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
            expect(revalidatePath).toHaveBeenCalled();
        });

        it("should throw error if the Discord bot backend responds with HTTP error", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(true as any);

            // Mock 500 error from bot
            mockFetch.mockResolvedValueOnce({
                ok: false,
                text: async () => "Bot missing permissions in channel!",
            });

            await expect(
                sendTicketMessageAction("guild_123", "chan_1")
            ).rejects.toThrow("Bot missing permissions in channel!");
        });
    });

    describe("deleteTicketMessageAction", () => {
        it("should instruct bot to delete message and reset postedMessageId in DB", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(true as any);
            vi.mocked(getTicketConfig).mockResolvedValue({
                enabled: true,
                postedMessageId: "discord_msg_999",
            } as any);

            mockFetch.mockResolvedValueOnce({
                ok: true,
            });

            await deleteTicketMessageAction("guild_123", "chan_1", "discord_msg_999");

            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining("/api/guilds/guild_123/tickets/delete-message"),
                expect.objectContaining({
                    method: "POST",
                })
            );
            expect(saveTicketConfig).toHaveBeenCalled();
            expect(revalidatePath).toHaveBeenCalled();
        });
    });

    describe("Read-only Action Wrappers", () => {
        it("getTicketsListAction should return rows from query", async () => {
            const mockRows = [{ id: 1, status: "OPEN" }];
            vi.mocked(getTicketList).mockResolvedValue({ rows: mockRows } as any);

            const result = await getTicketsListAction("guild_123");

            expect(result).toEqual(mockRows);
        });

        it("getTicketHistoryAction should return history from query", async () => {
            const mockHistory = { ticket_id: 1 } as any;
            vi.mocked(getTicketHistory).mockResolvedValue(mockHistory);

            const result = await getTicketHistoryAction("chan_123");

            expect(result).toEqual(mockHistory);
        });
    });
});