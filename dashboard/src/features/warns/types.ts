import { z } from "zod";

export const moderationActionSchema = z.enum([
    "TIMEOUT",
    "KICK",
    "BAN",
    "ROLE_REMOVE",
    "ROLE_ADD",
    "ROLE_REMOVE_ALL",
]);

export const warnSchema = z.object({
    id: z.string(),
    user_id: z.string(),
    guild_id: z.string(),
    moderator_id: z.string(),
    reason: z.string().default("No reason provided."),
    created_at: z.coerce.date().transform((d) => d.toISOString()),
    is_active: z.boolean().default(true),
});

export const warnThresholdSchema = z.object({
    id: z.coerce.number().int(),
    guild_id: z.string(),
    warn_count: z.number().int().min(1, "Warn count must be at least 1"),
    action_type: z.array(moderationActionSchema).min(1, "At least one action is required"),
    roles_to_add: z.array(z.string()).nullish().default([]),
    roles_to_remove: z.array(z.string()).nullish().default([]),
    duration: z.number().nullish().default(null),
});

export const saveWarnThresholdItemSchema = z
    .object({
        warnCount: z.number().int().min(1, "Warn count must be at least 1"),
        actionType: z.array(moderationActionSchema).min(1, "At least one action is required"),
        rolesToAdd: z.array(z.string()).nullish().default([]),
        rolesToRemove: z.array(z.string()).nullish().default([]),
        duration: z.number().nullish().default(null),
    })
    .superRefine((data, ctx) => {
        if (data.actionType.includes("TIMEOUT") && (!data.duration || data.duration <= 0)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Timeout duration must be at least 1 minute for warn count ${data.warnCount}.`,
                path: ["duration"],
            });
        }

        if (data.actionType.includes("ROLE_ADD") && (!data.rolesToAdd || data.rolesToAdd.length === 0)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Please select at least one role to add for warn count ${data.warnCount}.`,
                path: ["rolesToAdd"],
            });
        }

        if (data.actionType.includes("ROLE_REMOVE") && (!data.rolesToRemove || data.rolesToRemove.length === 0)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: `Please select at least one role to remove for warn count ${data.warnCount}.`,
                path: ["rolesToRemove"],
            });
        }
    });

export const saveWarnThresholdsInputSchema = z.array(saveWarnThresholdItemSchema);

export type ModerationAction = z.infer<typeof moderationActionSchema>;
export type Warn = z.infer<typeof warnSchema>;
export type WarnThreshold = z.infer<typeof warnThresholdSchema>;
export type SaveWarnThresholdInput = z.input<typeof saveWarnThresholdItemSchema>;