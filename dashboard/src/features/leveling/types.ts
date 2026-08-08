import { z } from "zod";
import { messageLayoutSchema } from "@/features/_shared/embed";

export const notificationScopeSchema = z
    .enum(["CURRENT_CHANNEL", "SPECIFIED_CHANNEL", "DM", "NONE"])
    .default("NONE");

export const targetTypeSchema = z.enum(["CHANNEL", "ROLE"]);

export const scopeActionModeSchema = z
    .enum(["EXEMPT", "ENFORCED"])
    .default("EXEMPT");

export const scopeSchema = z.object({
    mode: scopeActionModeSchema,
    roles: z.array(z.string()).default([]),
    channels: z.array(z.string()).default([]),
});

export const userLevelSchema = z.object({
    guild_id: z.string(),
    user_id: z.string(),
    cumulative_xp: z.number().int().nonnegative().default(0),
    current_level: z.number().int().nonnegative().default(0),
    current_xp: z.number().int().nonnegative().default(0),
    username: z.string().default(""),
});

export const DEFAULT_LEVEL_NOTIFY_MESSAGE = {
    enabled: true,
    format: "TEXT" as const,
    content: "",
    embed: {},
};

export const notificationSettingsSchema = z.object({
    scope: notificationScopeSchema,
    channelId: z.string().nullish().default(null),
    message: messageLayoutSchema.default(DEFAULT_LEVEL_NOTIFY_MESSAGE),
});

export const imageCardSettingsSchema = z.object({
    textColor: z.string().default("#FFFFFF"),
    barForegroundColor: z.string().default("#5865f2"),
    barBackgroundColor: z.string().default("#FFFFFF"),
    accentColor: z.string().default("#5865f2"),
    lineSeparatorColor: z.string().default("#FFFFFF"),
    usernameColor: z.string().default("#FFFFFF"),
    statisticsColor: z.string().default("#FFFFFF"),
    backgroundColor: z.string().default("#000000"),
});

export const rangeSchema = z.object({
    min: z.number().default(15),
    max: z.number().default(25),
});

export const textSettingsSchema = z.object({
    enabled: z.boolean().default(false),
    xpCooldown: z.number().default(60),
    xpRange: rangeSchema.default({ min: 15, max: 25 }),
    xpOnTickets: z.boolean().default(false),
});

export const voiceSettingsSchema = z.object({
    enabled: z.boolean().default(false),
    xpRange: rangeSchema.default({ min: 25, max: 50 }),
});

export const levelingConfigSchema = z.object({
    text: textSettingsSchema.default(textSettingsSchema.parse({})),
    voice: voiceSettingsSchema.default(voiceSettingsSchema.parse({})),
    scope: scopeSchema.default(scopeSchema.parse({})),
    notify: notificationSettingsSchema.default(notificationSettingsSchema.parse({})),
    imageCard: imageCardSettingsSchema.default(imageCardSettingsSchema.parse({})),
    levelCap: z.number().default(40),
    keepLevelOnLeave: z.boolean().default(false),
});

export const saveLevelingConfigSchema = levelingConfigSchema.superRefine((data, ctx) => {
    if (data.notify.scope === "SPECIFIED_CHANNEL" && !data.notify.channelId) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Please select a target channel for level-up notifications!",
            path: ["notify", "channelId"],
        });
    }
});

export const xpMultiplierSchema = z.object({
    guild_id: z.string(),
    target_id: z.string(),
    target_type: targetTypeSchema,
    multiplier: z.number().default(1),
});

export const saveXpMultiplierInputSchema = z.object({
    targetId: z.string().min(1, "Target ID is required"),
    targetType: targetTypeSchema,
    multiplier: z.number().positive().default(1),
});

export const levelRewardSchema = z.object({
    id: z.number().int().optional(),
    guild_id: z.string().optional(),
    level_requirement: z.number().int().min(1),
    roles_to_add: z.array(z.string()).default([]),
    remove_previous_roles: z.boolean().default(false),
});

export const saveLevelRewardInputSchema = z.object({
    levelRequirement: z.number().int().min(1, "Level requirement must be at least 1"),
    rolesToAdd: z.array(z.string()).default([]),
    removePreviousRoles: z.boolean().default(false),
});

export type NotificationScope = z.infer<typeof notificationScopeSchema>;
export type TargetType = z.infer<typeof targetTypeSchema>;
export type ScopeActionMode = z.infer<typeof scopeActionModeSchema>;
export type Scope = z.infer<typeof scopeSchema>;
export type UserLevel = z.infer<typeof userLevelSchema>;
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
export type ImageCardSettings = z.infer<typeof imageCardSettingsSchema>;
export type TextSettings = z.infer<typeof textSettingsSchema>;
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;
export type LevelingConfig = z.infer<typeof levelingConfigSchema>;
export type XpMultiplier = z.infer<typeof xpMultiplierSchema>;
export type LevelReward = z.infer<typeof levelRewardSchema>;
export type SaveXpMultiplierInput = z.infer<typeof saveXpMultiplierInputSchema>;
export type SaveLevelRewardInput = z.infer<typeof saveLevelRewardInputSchema>;

export const defaultLevelingConfig: LevelingConfig = levelingConfigSchema.parse({});