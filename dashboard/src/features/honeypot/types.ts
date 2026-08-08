import { z } from "zod";

export const honeypotConfigSchema = z.object({
    enabled: z.boolean().default(false),
    channelId: z.string().nullable().default(null),
    exemptRoles: z.array(z.string()).default([]),
    dmd: z.number().min(0).max(7).default(3),
    reason: z
        .string()
        .nullable()
        .default("Sending a message in a honeypot channel"),
    duration: z.number().nullable().default(null),
});

export type HoneypotConfig = z.infer<typeof honeypotConfigSchema>;
export type HoneypotConfigInput = z.input<typeof honeypotConfigSchema>;