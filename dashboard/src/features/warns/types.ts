import { z } from "zod";

export const moderationActionSchema = z.enum([
    "TIMEOUT",
    "KICK",
    "BAN",
    "ROLE_REMOVE",
    "ROLE_ADD",
    "ROLE_REMOVE_ALL",
]);
export type ModerationAction = z.infer<typeof moderationActionSchema>;

export const warnSchema = z.object({
    id: z.string(),
    user_id: z.string(),
    guild_id: z.string(),
    moderator_id: z.string(),
    reason: z.string(),
    created_at: z.coerce.date(), // Automatically parses Date object or ISO string
    isActive: z.boolean(),
});
export type Warn = z.infer<typeof warnSchema>;

export const warnThresholdSchema = z.object({
    id: z.number().int(),
    guild_id: z.string(),
    warn_count: z.number().int().min(1, "Warn count must be at least 1"),
    action_type: z.array(moderationActionSchema).min(1, "At least one action is required"),
    roles_to_add: z.array(z.string()).nullish(),
    roles_to_remove: z.array(z.string()).nullish(),
    duration: z.number().nullable(),
});
export type WarnThreshold = z.infer<typeof warnThresholdSchema>;

export const saveWarnThresholdItemSchema = z.object({
    warnCount: z.number().int().min(1, "Warn count must be at least 1"),
    actionType: z.array(moderationActionSchema).min(1, "At least one action is required"),
    rolesToAdd: z.array(z.string()).nullish(),
    rolesToRemove: z.array(z.string()).nullish(),
    duration: z.number().nullable().optional(),
});
export type SaveWarnThresholdInput = z.infer<typeof saveWarnThresholdItemSchema>;
export const saveWarnThresholdsInputSchema = z.array(saveWarnThresholdItemSchema);