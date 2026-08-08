import { z } from "zod";

export const raidActionKindSchema = z.enum([
    "ALERT",
    "LOCKDOWN_SERVER",
    "PAUSE_INVITES",
    "BUMP_VERIFICATION",
    "AUTO_BAN_NEW_ACCOUNTS",
    "TIMEOUT_NEW_JOINS",
]);

export const raidActionSchema = z.discriminatedUnion("type", [
    z.object({ type: z.literal("LOCKDOWN_SERVER") }),
    z.object({ type: z.literal("BUMP_VERIFICATION") }),
    z.object({ type: z.literal("PAUSE_INVITES"), hour: z.number().min(1) }),
    z.object({ type: z.literal("ALERT"), channelId: z.string().min(1, "Alert channel is required") }),
    z.object({ type: z.literal("TIMEOUT_NEW_JOINS"), mins: z.number().min(1) }),
    z.object({ type: z.literal("AUTO_BAN_NEW_ACCOUNTS"), maxAgeHours: z.number().min(1) }),
]);

export const raidDetectionInputSchema = z.object({
    enabled: z.boolean().default(false),
    zScoreMultiplier: z.number().default(3),
    minSafeLimit: z.number().default(5),
    windowSizeSeconds: z.number().default(60),
    raidActions: z.array(raidActionSchema).default([]),
});

export const saveRaidDetectionConfigSchema = raidDetectionInputSchema.superRefine((data, ctx) => {
    if (data.enabled && data.raidActions.length === 0) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "At least one raid mitigation action must be selected when raid protection is enabled!",
            path: ["raidActions"],
        });
    }
});

export const raidDetectionConfigSchema = raidDetectionInputSchema;

export const cachedStatsSchema = z.object({
    threshold: z.number(),
    mean_window: z.number(),
    std_dev_window: z.number(),
});

export const raidStatusSnapshotSchema = z.object({
    currentJoinsInWindow: z.number(),
    windowSizeSeconds: z.number(),
    calculatedThreshold: z.number(),
    avgJoinsPerMin: z.number(),
    stdDevPerMin: z.number(),
    isRaidActive: z.boolean(),
    statsAvailable: z.boolean(),
});

export type RaidActionKind = z.infer<typeof raidActionKindSchema>;
export type RaidAction = z.infer<typeof raidActionSchema>;
export type RaidDetectionInput = z.input<typeof raidDetectionInputSchema>;
export type RaidDetectionConfig = z.infer<typeof raidDetectionConfigSchema>;
export type CachedStats = z.infer<typeof cachedStatsSchema>;
export type RaidStatusSnapshot = z.infer<typeof raidStatusSnapshotSchema>;