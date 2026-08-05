import { z } from "zod";

export const counterTypeSchema = z.enum([
    "TOTAL_MEMBERS",
    "HUMANS_ONLY",
    "BOTS_ONLY",
    "ONLINE_MEMBERS",
    "ROLE_COUNT",
]);

export const counterChannelSchema = z.object({
    id: z.string(),
    channelId: z.string(),
    counterType: counterTypeSchema,
    roleId: z.string().optional(),
    nameTemplate: z.string(),
});

export const memberCounterInputSchema = z.object({
    enabled: z.boolean().default(false),
    updateIntervalMinutes: z.number().default(15),
    counters: z.array(counterChannelSchema).default([]),
});

export const memberCounterConfigSchema = memberCounterInputSchema;

export type CounterType = z.infer<typeof counterTypeSchema>;
export type CounterChannel = z.infer<typeof counterChannelSchema>;
export type MemberCounterInput = z.input<typeof memberCounterInputSchema>;
export type MemberCounterConfig = z.infer<typeof memberCounterConfigSchema>;