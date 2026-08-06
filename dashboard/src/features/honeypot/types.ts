import { z } from "zod";

export const honeypotConfigSchema = z.object({
    enabled: z.boolean().default(false),
    channelId: z.string().default(""),
    exemptRoles: z
        .array(z.string())
        .nullable()
        .transform((val) => val ?? [])
        .default([]),
    dmd: z.number().default(3),
    reason: z
        .string()
        .nullable()
        .transform((val) => val ?? "Sending a message in a honeypot channel")
        .default("Sending a message in a honeypot channel"),
    duration: z.number().nullable().default(null),
});

export type HoneypotConfig = z.infer<typeof honeypotConfigSchema>;
export type HoneypotConfigInput = z.input<typeof honeypotConfigSchema>;