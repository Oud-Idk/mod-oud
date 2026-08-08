import { z } from "zod";

export const joinLeaveActionSchema = z.enum(["JOIN", "LEAVE"]);

export const automodLogSchema = z.object({
    id: z.coerce.string(),
    guild_id: z.string(),
    user_id: z.string(),
    channel_id: z.string().nullish().default(null),
    message_id: z.string().nullish().default(null),
    rule_type: z.string(),
    trigger_content: z.string().nullish().default(null),
    original_content: z.string().nullish().default(null),
    actions_taken: z.array(z.string()).default([]),
    created_at: z.coerce.string(),
});

export const joinLeaveLogSchema = z.object({
    id: z.coerce.string(),
    user_id: z.string(),
    guild_id: z.string(),
    action: joinLeaveActionSchema,
    created_at: z.coerce.string(),
});

export const moderationLogSchema = z.object({
    case_id: z.coerce.string(),
    guild_id: z.string(),
    target_id: z.string().nullish().default(null),
    moderator_id: z.string(),
    action_type: z.string(),
    reason: z.string().nullish().default(null),
    duration: z.string().nullish().default(null),
    created_at: z.coerce.string(),
});

export const getLogsInputSchema = z.object({
    guildId: z.string().min(1),
    limit: z.number().int().positive().default(20),
    cursorCreatedAt: z.string().nullish().default(null),
    cursorId: z.string().nullish().default(null),
});

export type JoinLeaveAction = z.infer<typeof joinLeaveActionSchema>;
export type AutomodLog = z.infer<typeof automodLogSchema>;
export type JoinLeaveLog = z.infer<typeof joinLeaveLogSchema>;
export type ModerationLog = z.infer<typeof moderationLogSchema>;