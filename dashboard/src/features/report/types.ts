import { z } from "zod";
import { TogglableMessageSchema } from "@/features/_shared/embed";

export const simpleReportActionSchema = z.enum(["ACTIONED", "DISMISSED"]);
export const reportActionSchema = z.enum(["UNDER_REVIEW", "ACTIONED", "DISMISSED"]);
export const timeUnitSchema = z.enum(["MINUTES", "HOURS", "DAYS"]);

export const DEFAULT_REPORT_DM_MESSAGE = {
    enabled: false,
    message: {
        format: "TEXT" as const,
        content: "",
        embed: {},
    }
};

export const reportedMessageSchema = z.object({
    id: z.coerce.number(),
    guild_id: z.string(),
    channel_id: z.string(),
    message_id: z.string(),
    author_id: z.string(),
    reporter_id: z.string(),
    content: z.string().default(""),
    attachment_url: z.string().nullish().default(null),
    reason: z.string().default(""),
    status: reportActionSchema.default("UNDER_REVIEW"),
    moderator_id: z.string().nullish().default(null),
    moderator_notes: z.string().nullish().default(null),
    created_at: z.string(),
    resolved_at: z.string().nullish().default(null),
    message_deleted: z.boolean().default(false),
    user_warned: z.boolean().default(false),
    user_timed_out: z.boolean().default(false),
    user_banned: z.boolean().default(false),
});

export const reportConfigSchema = z.object({
    enabled: z.boolean().default(false),
    reportingChannel: z.string().nullish().default(null),
    resolvedDm: TogglableMessageSchema.default(DEFAULT_REPORT_DM_MESSAGE),
    dismissedDm: TogglableMessageSchema.default(DEFAULT_REPORT_DM_MESSAGE),
});


export type SimpleReportAction = z.infer<typeof simpleReportActionSchema>;
export type ReportAction = z.infer<typeof reportActionSchema>;
export type TimeUnit = z.infer<typeof timeUnitSchema>;
export type ReportedMessage = z.infer<typeof reportedMessageSchema>;
export type ReportConfig = z.infer<typeof reportConfigSchema>;
