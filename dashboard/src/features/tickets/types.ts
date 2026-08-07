import { z } from "zod";
import { DiscordEmbed } from "@/features/_shared/embed";

// ==========================================
// 1. Shared Enums & Constants
// ==========================================

export const FormatSchema = z.enum(["TEXT", "EMBED"]).default("TEXT");
export const TicketStatusSchema = z.enum(["OPEN", "CLOSED"]);
export const ViewTicketStatusSchema = z.enum(["ALL", "OPEN", "CLOSED"]);

// Freeze default object to prevent accidental mutation bugs
export const DEFAULT_MESSAGE_LAYOUT = Object.freeze({
    enabled: false,
    format: "TEXT" as const,
    content: "",
    embed: {},
});

// Reuseable helper for ISO Date Strings / Date coercion
const IsoDateSchema = z.string().datetime().or(z.date());

// ==========================================
// 2. Config Schemas
// ==========================================

export const MessageLayoutSchema = z.object({
    enabled: z.boolean().default(false),
    format: FormatSchema,
    content: z.string().default(""),
    // Passthrough allow flexible embed objects while staying type-safe
    embed: z.custom<DiscordEmbed>().default({}),
}).default(DEFAULT_MESSAGE_LAYOUT);

export const TicketConfigSchema = z.object({
    categoryId: z.string().nullish().default(null),
    channelId: z.string().nullish().default(null),
    ticketRoleId: z.string().nullish().default(null),
    postedMessageId: z.string().nullish().default(null),

    enabled: z.boolean().default(false),
    format: FormatSchema,
    content: z.string().default(""),
    embed: z.custom<DiscordEmbed>().default({}),

    // Added numerical constraints (.int().min(1))
    warnThreshold: z.number().int().positive().default(30),
    deleteThreshold: z.number().int().positive().default(45),
    bumpEvery: z.number().int().positive().default(20),

    welcomeMessage: MessageLayoutSchema,
});

export const SaveTicketConfigSchema = TicketConfigSchema.superRefine((data, ctx) => {
    if (data.enabled) {
        if (!data.categoryId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Please select a Discord Category for tickets!",
                path: ["categoryId"],
            });
        }

        if (!data.channelId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Please select a channel to post the panel!",
                path: ["channelId"],
            });
        }

        if (!data.ticketRoleId) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Please select a Support Staff Role!",
                path: ["ticketRoleId"],
            });
        }
    }
});

// ==========================================
// 3. Ticket Schemas
// ==========================================

export const TicketMessageSchema = z.object({
    message_id: z.string(),
    author_id: z.string(),
    content: z.string(),
    created_at: IsoDateSchema,
    is_ticket_manager: z.boolean(),
});

export const TicketSchema = z.object({
    id: z.number().int().positive(),
    channel_id: z.string(),
    opener_id: z.string(),
    status: TicketStatusSchema,
    created_at: IsoDateSchema,
    closed_at: IsoDateSchema.nullable(),
    message_count: z.number().int().nonnegative(),
});

export const TicketHistorySchema = z.object({
    ticket_id: z.number().int().positive(),
    guild_id: z.string(),
    channel_id: z.string(),
    opener_id: z.string(),
    status: TicketStatusSchema,
    created_at: IsoDateSchema,
    closed_at: IsoDateSchema.nullable(),
    last_activity: IsoDateSchema,
    message_count: z.number().int().nonnegative(),
    messages: z.array(TicketMessageSchema),
});


export type Format = z.infer<typeof FormatSchema>;
export type TicketStatus = z.infer<typeof TicketStatusSchema>;
export type ViewTicketStatus = z.infer<typeof ViewTicketStatusSchema>;

export type MessageLayout = z.infer<typeof MessageLayoutSchema>;
export type TicketConfig = z.infer<typeof TicketConfigSchema>;
export type SaveTicketConfig = z.infer<typeof SaveTicketConfigSchema>;

export type TicketMessage = z.infer<typeof TicketMessageSchema>;
export type Ticket = z.infer<typeof TicketSchema>;
export type TicketHistory = z.infer<typeof TicketHistorySchema>;