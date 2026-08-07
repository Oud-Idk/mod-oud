import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    getTicketConfig,
    saveTicketConfig,
    getTicketList,
    getTicketHistory
} from "./queries";
import { db } from "@/lib/db";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

vi.mock("@/lib/db", () => ({
    db: {
        query: vi.fn(),
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

    // ==========================================
    // getTicketConfig Tests
    // ==========================================
    describe("getTicketConfig", () => {
        it("should return full default config when DB returns null", async () => {
            // Simulate database returning no saved config
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getTicketConfig("guild_123");

            // Verify Zod populated default values automatically!
            expect(result.enabled).toBe(false);
            expect(result.warnThreshold).toBe(30);
            expect(result.categoryId).toBeNull();
            expect(result.welcomeMessage.enabled).toBe(false);
            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "tickets");
        });

        it("should merge saved DB config with Zod defaults for missing fields", async () => {
            // Simulate partial DB record
            vi.mocked(getGuildConfigField).mockResolvedValue({
                enabled: true,
                categoryId: "cat_999",
                // Notice warnThreshold and welcomeMessage are missing!
            });

            const result = await getTicketConfig("guild_123");

            expect(result.enabled).toBe(true);
            expect(result.categoryId).toBe("cat_999");
            // Zod automatically supplied default for missing fields!
            expect(result.warnThreshold).toBe(30);
            expect(result.deleteThreshold).toBe(45);
        });
    });

    // ==========================================
    // saveTicketConfig Tests
    // ==========================================
    describe("saveTicketConfig", () => {
        it("should parse with Zod and save valid config to DB", async () => {
            const validConfig: any = {
                categoryId: "cat_123",
                channelId: "chan_456",
                ticketRoleId: "role_123",
                enabled: true,
            };

            await saveTicketConfig("guild_123", validConfig);

            // Verify saveGuildConfigField received the Zod-validated data
            expect(saveGuildConfigField).toHaveBeenCalledWith(
                "guild_123",
                "tickets",
                expect.objectContaining({
                    categoryId: "cat_123",
                    channelId: "chan_456",
                    enabled: true,
                    warnThreshold: 30, // Injected default!
                })
            );
        });
    });

    // ==========================================
    // getTicketHistory Tests
    // ==========================================
    describe("getTicketHistory", () => {
        it("should return the first row when ticket history is found", async () => {
            const mockHistory = {
                ticket_id: 1,
                guild_id: "guild_123",
                channel_id: "chan_456",
                opener_id: "user_789",
                status: "OPEN",
                created_at: new Date(),
                closed_at: null,
                last_activity: new Date(),
                message_count: 5,
                messages: [],
            };

            vi.mocked(db.query).mockResolvedValue({
                rows: [mockHistory],
                rowCount: 1,
            } as any);

            const result = await getTicketHistory("chan_456");

            expect(result).toEqual(mockHistory);
            expect(db.query).toHaveBeenCalledWith(expect.any(String), ["chan_456"]);
        });

        it("should return null when no ticket history is found", async () => {
            vi.mocked(db.query).mockResolvedValue({
                rows: [],
                rowCount: 0,
            } as any);

            const result = await getTicketHistory("non_existent_channel");

            expect(result).toBeNull();
        });
    });

    // ==========================================
    // getTicketList Tests
    // ==========================================
    describe("getTicketList", () => {
        it("should query tickets for the given guild ID", async () => {
            const mockRows = [{ id: 1, status: "OPEN" }];
            vi.mocked(db.query).mockResolvedValue({
                rows: mockRows,
            } as any);

            const res = await getTicketList("guild_123");

            expect(res).toEqual(mockRows);
            expect(db.query).toHaveBeenCalledWith(expect.any(String), ["guild_123"]);
        });
    });
});