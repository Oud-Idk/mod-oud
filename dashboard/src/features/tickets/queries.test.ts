import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    getTicketConfig,
    saveTicketConfig,
    getTicketList,
    getTicketHistory
} from "./queries";
import { db } from "@/lib/db";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { TicketConfig } from "@/features/tickets/types";

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

            vi.mocked(db.query).mockResolvedValue({
                rows: [mockHistory],
                rowCount: 1,
                command: "",
                oid: 0,
                fields: [],
                _parsers: [],
                _types: { builtins: {} },
            } as never);

            const result = await getTicketHistory("chan_456");

            // IsoDateSchema transforms Date -> ISO string
            expect(result).toEqual({
                ...mockHistory,
                created_at: now.toISOString(),
                last_activity: now.toISOString(),
            });
            expect(db.query).toHaveBeenCalledWith(expect.any(String), ["chan_456"]);
        });

        it("should return null when no ticket history is found", async () => {
            vi.mocked(db.query).mockResolvedValue({
                rows: [],
                rowCount: 0,
                command: "",
                oid: 0,
                fields: [],
                _parsers: [],
                _types: { builtins: {} },
            } as never);

            const result = await getTicketHistory("non_existent_channel");

            expect(result).toBeNull();
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

            vi.mocked(db.query).mockResolvedValue({
                rows: mockRows,
                command: "",
                oid: 0,
                fields: [],
                _parsers: [],
                _types: { builtins: {} },
            } as never);

            const res = await getTicketList("guild_123");

            // TicketSchema converts Date -> ISO string
            expect(res).toEqual([
                {
                    ...mockRows[0],
                    created_at: now.toISOString(),
                },
            ]);
            expect(db.query).toHaveBeenCalledWith(expect.any(String), ["guild_123"]);
        });
    });
});