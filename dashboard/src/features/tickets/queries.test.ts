import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTicketConfig, saveTicketConfig } from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { TicketConfig } from "@/features/tickets/types";


// Row mapping, SQL shape and the JSONB round trip live in
// queries.integration.test.ts against a real database. What stays here is a
// failing connection, which Postgres will not produce on demand.

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
            const config: TicketConfig = {
                categoryId: "cat_123",
                channelId: "chan_456",
                ticketRoleId: "role_123",
                postedMessageId: null,
                enabled: true,
                panelMessage: { enabled: false, message: { format: "TEXT", content: "", embed: {} } },
                welcomeMessage: { enabled: false, message: { format: "TEXT", content: "", embed: {} } },
                warnThreshold: 30,
                deleteThreshold: 45,
                bumpEvery: 20,
            };

            await saveTicketConfig("guild_123", config);

            expect(saveGuildConfigField).toHaveBeenCalledWith("guild_123", "tickets", config);
        });

        it("should propagate a database error from saveGuildConfigField", async () => {
            vi.mocked(saveGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(
                saveTicketConfig("guild_123", {
                    categoryId: null,
                    channelId: null,
                    ticketRoleId: null,
                    postedMessageId: null,
                    enabled: false,
                    panelMessage: {
                        enabled: false,
                        message: { format: "TEXT", content: "", embed: {} },
                    },
                    welcomeMessage: {
                        enabled: false,
                        message: { format: "TEXT", content: "", embed: {} },
                    },
                    warnThreshold: 30,
                    deleteThreshold: 45,
                    bumpEvery: 20,
                })
            ).rejects.toThrow("connection lost");
        });
    });
});