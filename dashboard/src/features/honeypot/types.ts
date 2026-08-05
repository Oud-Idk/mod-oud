import { z } from "zod";

export const honeypotConfigSchema = z.object({
    enabled: z.boolean().default(false),
    channelId: z.string().default(""),
    exemptRoles: z.array(z.string()).default([]),
    dmd: z.number().default(3),
    reason: z.string().default("Sending a message in a honeypot channel"),
    duration: z.number().nullable().default(null),
});

export type HoneypotConfig = z.infer<typeof honeypotConfigSchema>;
export type HoneypotConfigInput = z.input<typeof honeypotConfigSchema>;