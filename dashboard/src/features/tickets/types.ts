import { z } from "zod";
import {
    DEFAULT_MESSAGE_LAYOUT,
    MessageLayoutSchema
} from "@/features/_shared/embed";

export const FormatSchema = z.enum(["TEXT", "EMBED"]).default("TEXT");
export const TicketStatusSchema = z.enum(["OPEN", "CLOSED"]);
export const ViewTicketStatusSchema = z.enum(["ALL", "OPEN", "CLOSED"]);

const IsoDateSchema = z.string().datetime().or(z.date());

export const TicketConfigSchema = z.object({
    categoryId: z.string().nullish().default(null),
    channelId: z.string().nullish().default(null),
    ticketRoleId: z.string().nullish().default(null),
    postedMessageId: z.string().nullish().default(null),

    enabled: z.boolean().default(false),

    panelMessage: MessageLayoutSchema.default(DEFAULT_MESSAGE_LAYOUT),
    welcomeMessage: MessageLayoutSchema.default(DEFAULT_MESSAGE_LAYOUT),

    warnThreshold: z.number().default(30),
    deleteThreshold: z.number().default(45),
    bumpEvery: z.number().default(20),
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