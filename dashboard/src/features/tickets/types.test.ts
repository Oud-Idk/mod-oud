import { describe, it, expect } from "vitest";
import { DEFAULT_MESSAGE_LAYOUT, isDeepEqual } from "@/features/_shared/embed";
import {
    TicketConfigSchema,
    SaveTicketConfigSchema,
    TicketHistorySchema,
    TicketSchema,
    TicketMessageSchema,
    ViewTicketStatusSchema,
    type TicketConfig,
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

    describe("TicketSchema (DB rows)", () => {
        const baseRow = {
            id: 1,
            channel_id: "chan_123",
            opener_id: "user_789",
            status: "OPEN",
            created_at: "2026-01-01T00:00:00.000Z",
            closed_at: null,
        };

        it("should coerce a string id to a number and Date created_at to ISO", () => {
            const result = TicketSchema.safeParse({
                ...baseRow,
                id: "42",
                created_at: new Date("2026-01-01T00:00:00.000Z"),
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.id).toBe(42);
                expect(result.data.created_at).toBe("2026-01-01T00:00:00.000Z");
            }
        });

        it("should default message_count to 0 when omitted", () => {
            const result = TicketSchema.safeParse(baseRow);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.message_count).toBe(0);
            }
        });

        it("should reject a non-positive id", () => {
            const result = TicketSchema.safeParse({ ...baseRow, id: 0 });

            expect(result.success).toBe(false);
        });

        it("should reject an invalid status", () => {
            const result = TicketSchema.safeParse({ ...baseRow, status: "PENDING" });

            expect(result.success).toBe(false);
        });

        it("should reject a negative message_count", () => {
            const result = TicketSchema.safeParse({ ...baseRow, message_count: -1 });

            expect(result.success).toBe(false);
        });
    });

    describe("TicketMessageSchema", () => {
        it("should default content and is_ticket_manager when omitted", () => {
            const result = TicketMessageSchema.safeParse({
                message_id: "msg_1",
                author_id: "user_1",
                created_at: "2026-01-01T00:00:00.000Z",
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.content).toBe("");
                expect(result.data.is_ticket_manager).toBe(false);
            }
        });

        it("should convert a Date created_at to an ISO string", () => {
            const result = TicketMessageSchema.safeParse({
                message_id: "msg_1",
                author_id: "user_1",
                created_at: new Date("2026-01-02T00:00:00.000Z"),
            });

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.created_at).toBe("2026-01-02T00:00:00.000Z");
            }
        });
    });

    describe("ViewTicketStatusSchema", () => {
        it("should accept ALL, OPEN, and CLOSED", () => {
            expect(ViewTicketStatusSchema.safeParse("ALL").success).toBe(true);
            expect(ViewTicketStatusSchema.safeParse("OPEN").success).toBe(true);
            expect(ViewTicketStatusSchema.safeParse("CLOSED").success).toBe(true);
        });

        it("should reject an unknown status", () => {
            expect(ViewTicketStatusSchema.safeParse("PENDING").success).toBe(false);
        });
    });

    describe("message.enabled phantom regression (stuck save popup)", () => {
        it("should not include enabled inside default message layouts", () => {
            expect("enabled" in DEFAULT_MESSAGE_LAYOUT).toBe(false);

            const parsed = TicketConfigSchema.parse({});

            expect("enabled" in parsed.panelMessage.message).toBe(false);
            expect("enabled" in parsed.welcomeMessage.message).toBe(false);
        });

        it("should strip a legacy nested enabled flag when parsing stored config", () => {
            const stored: unknown = {
                panelMessage: { enabled: false, message: { format: "TEXT", content: "hello", embed: {}, enabled: false } },
                welcomeMessage: { enabled: false, message: { format: "TEXT", content: "hi", embed: {}, enabled: false } },
            };

            const parsed = TicketConfigSchema.parse(stored);

            expect("enabled" in parsed.panelMessage.message).toBe(false);
            expect("enabled" in parsed.welcomeMessage.message).toBe(false);
        });

        it("should read as clean after toggling ticketing on and back off", () => {
            // The toggle handler rebuilds panelMessage.message as
            // { format, content, embed }; with phantom-free defaults this
            // round-trips back to the initial config exactly.
            const initial = TicketConfigSchema.parse({});
            const toggledBackOff: TicketConfig = {
                ...initial,
                enabled: false,
                panelMessage: {
                    enabled: false,
                    message: { format: "TEXT", content: "", embed: {} },
                },
            };

            expect(isDeepEqual(toggledBackOff, initial)).toBe(true);
        });
    });
});