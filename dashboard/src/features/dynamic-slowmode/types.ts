import { z } from "zod";

/**
 * Ladder rungs Discord's own UI offers, so every value the bot writes is one an admin can
 * reproduce by hand. Kept in step with `LADDER` in the bot's `types.rs`.
 */
export const SLOWMODE_LADDER = [0, 5, 10, 15, 30, 60, 120, 300, 600] as const;

const thresholdsSchema = z
    .array(z.number().int().min(1).max(10_000))
    .length(SLOWMODE_LADDER.length - 1, "Provide one threshold per rung above zero.");

export const dynamicSlowmodeConfigSchema = z.object({
    enabled: z.boolean().default(false),
    channels: z.array(z.string().min(1)).default([]),
    ceilingSecs: z
        .number()
        .int()
        .min(5)
        .max(21_600)
        .default(300),
    authorThresholds: thresholdsSchema.default([4, 6, 9, 13, 18, 24, 30, 40]),
    volumeThresholds: thresholdsSchema.default([16, 26, 38, 56, 78, 104, 130, 170]),
    windowSecs: z.number().int().min(10).max(600).default(60),
});

export const saveDynamicSlowmodeConfigSchema = dynamicSlowmodeConfigSchema.superRefine((data, ctx) => {
    if (data.enabled && data.channels.length === 0) {
        ctx.addIssue({
            code: "custom",
            message: "Add at least one channel before enabling dynamic slowmode.",
            path: ["channels"],
        });
    }

    const ladder: readonly number[] = SLOWMODE_LADDER;
    if (!ladder.includes(data.ceilingSecs)) {
        ctx.addIssue({
            code: "custom",
            message: "The ceiling must be one of the ladder values.",
            path: ["ceilingSecs"],
        });
    }
});

export const slowmodeChannelStatusSchema = z.object({
    channelId: z.string(),
    preAutomationSecs: z.number(),
    lastWrittenSecs: z.number(),
    authors: z.number(),
    volume: z.number(),
    armed: z.boolean(),
    status: z.string(),
});

export const slowmodeStatusSchema = z.object({
    config: dynamicSlowmodeConfigSchema,
    channels: z.array(slowmodeChannelStatusSchema),
});

export type DynamicSlowmodeConfig = z.infer<typeof dynamicSlowmodeConfigSchema>;
export type DynamicSlowmodeConfigInput = z.input<typeof dynamicSlowmodeConfigSchema>;
export type SlowmodeChannelStatus = z.infer<typeof slowmodeChannelStatusSchema>;
export type SlowmodeStatus = z.infer<typeof slowmodeStatusSchema>;
