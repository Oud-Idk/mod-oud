import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    getTicketConfig,
    saveTicketConfig,
    getTicketList,
    getTicketHistory
} from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { TicketConfig } from "@/features/tickets/types";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{
        rows?: unknown[];
        rowCount?: number | null;
    }>>()
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

describe("Tickets Query Module", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getTicketConfig", () => {
        it("should return full default config when DB returns null", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getTicketConfig("guild_123");

            expect(result.enabled).toBe(false);
            expect(result.warnThreshold).toBe(30);
            expect(result.categoryId).toBeNull();
            expect(result.welcomeMessage.enabled).toBe(false);
            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "tickets");
        });

        it("should merge saved DB config with Zod defaults for missing fields", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({
                enabled: true,
                categoryId: "cat_999",
            });

            const result = await getTicketConfig("guild_123");

            expect(result.enabled).toBe(true);
            expect(result.categoryId).toBe("cat_999");
            expect(result.warnThreshold).toBe(30);
            expect(result.deleteThreshold).toBe(45);
        });

        it("should propagate a database error from getGuildConfigField", async () => {
            vi.mocked(getGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(getTicketConfig("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveTicketConfig", () => {
        it("should forward the validated config to saveGuildConfigField", async () => {
            const mockValidatedConfig: TicketConfig = {
                categoryId: "cat_123",
                channelId: "chan_456",
                ticketRoleId: "role_123",
                postedMessageId: null,
                enabled: true,
                panelMessage: { enabled: false, message: { format: "TEXT", content: "", embed: {}} },
                welcomeMessage: { enabled: false, message: { format: "TEXT", content: "", embed: {}} },
                warnThreshold: 30,
                deleteThreshold: 45,
                bumpEvery: 20,
            };

            await saveTicketConfig("guild_123", mockValidatedConfig);

            // Verify saveGuildConfigField received exact config
            expect(saveGuildConfigField).toHaveBeenCalledWith(
                "guild_123",
                "tickets",
                mockValidatedConfig
            );
        });
    });

    describe("getTicketHistory", () => {
        it("should return the first row when ticket history is found", async () => {
            const now = new Date();
            const mockHistory = {
                ticket_id: 1,
                guild_id: "guild_123",
                channel_id: "chan_456",
                opener_id: "user_789",
                status: "OPEN",
                created_at: now,
                closed_at: null,
                last_activity: now,
                message_count: 5,
                messages: [],
            };

            mockQuery.mockResolvedValue({
                rows: [mockHistory],
                rowCount: 1,
            });

            const result = await getTicketHistory("chan_456");

            // IsoDateSchema transforms Date -> ISO string
            expect(result).toEqual({
                ...mockHistory,
                created_at: now.toISOString(),
                last_activity: now.toISOString(),
            });
            expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["chan_456"]);
        });

        it("should return null when no ticket history is found", async () => {
            mockQuery.mockResolvedValue({
                rows: [],
                rowCount: 0,
            });

            const result = await getTicketHistory("non_existent_channel");

            expect(result).toBeNull();
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getTicketHistory("chan_456")).rejects.toThrow("connection lost");
        });
    });

    describe("getTicketList", () => {
        it("should query tickets for the given guild ID", async () => {
            const now = new Date();
            const mockRows = [
                {
                    id: 1,
                    channel_id: "chan_456",
                    opener_id: "user_789",
                    status: "OPEN",
                    created_at: now,
                    closed_at: null,
                    message_count: 0,
                },
            ];

            mockQuery.mockResolvedValue({
                rows: mockRows,
                rowCount: 1,
            });

            const res = await getTicketList("guild_123");

            // TicketSchema converts Date -> ISO string
            expect(res).toEqual([
                {
                    ...mockRows[0],
                    created_at: now.toISOString(),
                },
            ]);
            expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ["guild_123"]);
        });

        it("should return an empty array when no tickets exist", async () => {
            mockQuery.mockResolvedValue({
                rows: [],
                rowCount: 0,
            });

            const res = await getTicketList("guild_empty");

            expect(res).toEqual([]);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getTicketList("guild_123")).rejects.toThrow("connection lost");
        });
    });
});
