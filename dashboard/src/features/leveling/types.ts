import { z } from "zod";
import { messageLayoutSchema } from "@/features/_shared/embed";

export const notificationTargetSchema = z.discriminatedUnion("scope", [
    z.object({
        scope: z.literal("NONE")
    }),
    z.object({
        scope: z.literal("DM")
    }),
    z.object({
        scope: z.literal("CURRENT_CHANNEL")
    }),
    z.object({
        scope: z.literal("SPECIFIED_CHANNEL"),
        channelId: z.string().min(1, "Please select a target channel for notifications!"),
    }),
]);

export const DEFAULT_LEVEL_NOTIFY_MESSAGE = {
    enabled: true,
    format: "TEXT" as const,
    content: "Congratulations {user}, you have leveled up to **level {level}**!",
    embed: {},
};

export const notificationSettingsSchema = z.intersection(
    notificationTargetSchema,
    z.object({
        message: messageLayoutSchema.default(DEFAULT_LEVEL_NOTIFY_MESSAGE),
    })
);

export const scopeActionModeSchema = z
    .enum(["EXEMPT", "ENFORCED"])
    .default("EXEMPT");

export const levelingScopeSchema = z.object({
    mode: scopeActionModeSchema,
    roles: z.array(z.string()).default([]),
    channels: z.array(z.string()).default([]),
});

export const rangeSchema = z.object({
    min: z.number().int().nonnegative().default(15),
    max: z.number().int().nonnegative().default(25),
});

export const textSettingsSchema = z.object({
    enabled: z.boolean().default(false),
    xpCooldown: z.number().int().nonnegative().default(60),
    xpRange: rangeSchema.default({ min: 15, max: 25 }),
    xpOnTickets: z.boolean().default(false),
});

export const voiceSettingsSchema = z.object({
    enabled: z.boolean().default(false),
    xpRange: rangeSchema.default({ min: 25, max: 50 }),
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

export const levelingConfigSchema = z.object({
    text: textSettingsSchema.default(textSettingsSchema.parse({})),
    voice: voiceSettingsSchema.default(voiceSettingsSchema.parse({})),
    scope: levelingScopeSchema.default(levelingScopeSchema.parse({})),
    imageCard: imageCardSettingsSchema.default(imageCardSettingsSchema.parse({})),
    notify: notificationSettingsSchema.default({
        scope: "NONE",
        message: DEFAULT_LEVEL_NOTIFY_MESSAGE,
    }),
    levelCap: z.number().int().nonnegative().default(40),
    keepLevelOnLeave: z.boolean().default(false),
});

export const xpTargetSchema = z.discriminatedUnion("targetType", [
    z.object({
        targetType: z.literal("CHANNEL"),
        targetId: z.string().min(1, "Target Channel ID is required"),
    }),
    z.object({
        targetType: z.literal("ROLE"),
        targetId: z.string().min(1, "Target Role ID is required"),
    }),
]);

export const xpMultiplierSchema = z.intersection(
    xpTargetSchema,
    z.object({
        guildId: z.string(),
        multiplier: z.number().positive().default(1),
    })
);

export const saveXpMultiplierInputSchema = z.intersection(
    xpTargetSchema,
    z.object({
        multiplier: z.number().positive().default(1),
    })
);

export const levelRewardSchema = z.object({
    id: z.coerce.number().int().optional(),
    guildId: z.string().optional(),
    levelRequirement: z.coerce.number().int().min(1, "Level requirement must be at least 1"),
    rolesToAdd: z.array(z.string()).default([]),
    removePreviousRoles: z.boolean().default(false),
});

export const saveLevelRewardInputSchema = z.object({
    levelRequirement: z.coerce.number().int().min(1, "Level requirement must be at least 1"),
    rolesToAdd: z.array(z.string()).default([]),
    removePreviousRoles: z.boolean().default(false),
});

export const userLevelSchema = z.object({
    guildId: z.string(),
    userId: z.string(),
    cumulativeXp: z.coerce.number().default(0),
    currentLevel: z.coerce.number().default(0),
    currentXp: z.coerce.number().default(0),
    username: z.string().default(""),
});

export type NotificationTarget = z.infer<typeof notificationTargetSchema>;
export type NotificationSettings = z.infer<typeof notificationSettingsSchema>;
export type ScopeActionMode = z.infer<typeof scopeActionModeSchema>;
export type LevelingScope = z.infer<typeof levelingScopeSchema>;
export type TextSettings = z.infer<typeof textSettingsSchema>;
export type VoiceSettings = z.infer<typeof voiceSettingsSchema>;
export type ImageCardSettings = z.infer<typeof imageCardSettingsSchema>;
export type LevelingConfig = z.infer<typeof levelingConfigSchema>;
export type XpTarget = z.infer<typeof xpTargetSchema>;
export type XpMultiplier = z.infer<typeof xpMultiplierSchema>;
export type SaveXpMultiplierInput = z.infer<typeof saveXpMultiplierInputSchema>;
export type SaveLevelRewardInput = z.infer<typeof saveLevelRewardInputSchema>;
export type LevelReward = z.infer<typeof levelRewardSchema>;
export type UserLevel = z.infer<typeof userLevelSchema>;

export const defaultLevelingConfig: LevelingConfig = levelingConfigSchema.parse({});