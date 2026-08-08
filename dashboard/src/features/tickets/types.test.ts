import { describe, it, expect } from "vitest";
import {
    TicketConfigSchema,
    SaveTicketConfigSchema,
    TicketHistorySchema,
} from "./types";

describe("Ticket Schemas Unit Tests", () => {

    describe("TicketConfigSchema", () => {
        it("should auto-populate defaults when parsing an empty object", () => {
            const parsed = TicketConfigSchema.parse({});

            expect(parsed.enabled).toBe(false);
            expect(parsed.categoryId).toBeNull();
            expect(parsed.channelId).toBeNull();
            expect(parsed.ticketRoleId).toBeNull();
            expect(parsed.postedMessageId).toBeNull();
            expect(parsed.warnThreshold).toBe(30);
            expect(parsed.deleteThreshold).toBe(45);
            expect(parsed.bumpEvery).toBe(20);
            expect(parsed.panelMessage.message.format).toBe("TEXT");
            expect(parsed.welcomeMessage.message.format).toBe("TEXT");
            expect(parsed.welcomeMessage.enabled).toBe(false);
        });

        it("should accept null, undefined, or valid strings for ID fields", () => {
            const inputWithNulls = {
                categoryId: null,
                channelId: undefined, // Will be parsed as nullish
                ticketRoleId: "role_123",
            };

            const parsed = TicketConfigSchema.parse(inputWithNulls);

            expect(parsed.categoryId).toBeNull();
            expect(parsed.ticketRoleId).toBe("role_123");
        });
    });

    describe("SaveTicketConfigSchema (.superRefine Validation)", () => {
        it("should ALLOW null IDs when ticketing is DISABLED (Draft Mode)", () => {
            const draftConfig = {
                enabled: false,
                categoryId: null,
                channelId: null,
                ticketRoleId: null,
            };

            const result = SaveTicketConfigSchema.safeParse(draftConfig);

            // Drafts are allowed to have null IDs!
            expect(result.success).toBe(true);
        });

        it("should REJECT save if enabled = true but categoryId is null", () => {
            const invalidConfig = {
                enabled: true,
                categoryId: null, // ❌ Missing!
                channelId: "channel_123",
                ticketRoleId: "role_123",
            };

            const result = SaveTicketConfigSchema.safeParse(invalidConfig);

            expect(result.success).toBe(false);
            if (!result.success) {
                const issues = result.error.issues;
                expect(issues[0].message).toBe("Please select a Discord Category for tickets!");
                expect(issues[0].path).toContain("categoryId");
            }
        });

        it("should REJECT save if enabled = true but channelId is null", () => {
            const invalidConfig = {
                enabled: true,
                categoryId: "cat_123",
                channelId: null, // ❌ Missing!
                ticketRoleId: "role_123",
            };

            const result = SaveTicketConfigSchema.safeParse(invalidConfig);

            expect(result.success).toBe(false);
            if (!result.success) {
                const issues = result.error.issues;
                expect(issues[0].message).toBe("Please select a channel to post the panel!");
                expect(issues[0].path).toContain("channelId");
            }
        });

        it("should REJECT save if enabled = true but ticketRoleId is null", () => {
            const invalidConfig = {
                enabled: true,
                categoryId: "cat_123",
                channelId: "channel_123",
                ticketRoleId: null, // ❌ Missing!
            };

            const result = SaveTicketConfigSchema.safeParse(invalidConfig);

            expect(result.success).toBe(false);
            if (!result.success) {
                const issues = result.error.issues;
                expect(issues[0].message).toBe("Please select a Support Staff Role!");
                expect(issues[0].path).toContain("ticketRoleId");
            }
        });

        it("should PASS save when enabled = true AND all required IDs are provided", () => {
            const validConfig = {
                enabled: true,
                categoryId: "cat_123",
                channelId: "channel_123",
                ticketRoleId: "role_123",
            };

            const result = SaveTicketConfigSchema.safeParse(validConfig);

            expect(result.success).toBe(true);
        });
    });

    describe("TicketHistorySchema", () => {
        it("should validate full ticket history structure", () => {
            const validHistory = {
                ticket_id: 1,
                guild_id: "guild_123",
                channel_id: "channel_456",
                opener_id: "user_789",
                status: "OPEN",
                created_at: new Date(),
                closed_at: null,
                last_activity: new Date(),
                message_count: 1,
                messages: [
                    {
                        message_id: "msg_1",
                        author_id: "user_789",
                        content: "I need help!",
                        created_at: "2026-08-07T10:00:00Z",
                        is_ticket_manager: false,
                    },
                ],
            };

            const result = TicketHistorySchema.safeParse(validHistory);

            expect(result.success).toBe(true);
        });
    });
});