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
    channelId: z.string().nullish().default(null),
    counterType: counterTypeSchema,
    roleId: z.string().nullish().default(null),
    nameTemplate: z.string().default("👥 Members: {count}"),
});

export const memberCounterConfigSchema = z.object({
    enabled: z.boolean().default(false),
    updateIntervalMinutes: z.number().default(15),
    counters: z.array(counterChannelSchema).default([]),
});

export const saveMemberCounterConfigSchema = memberCounterConfigSchema.superRefine((data, ctx) => {
    if (data.enabled) {
        data.counters.forEach((counter, idx) => {
            if (!counter.channelId) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Counter #${idx + 1} requires a target voice channel!`,
                    path: ["counters", idx, "channelId"],
                });
            }
            if (counter.counterType === "ROLE_COUNT" && !counter.roleId) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Counter #${idx + 1} requires a specific role selected!`,
                    path: ["counters", idx, "roleId"],
                });
            }
        });
    }
});

export type CounterType = z.infer<typeof counterTypeSchema>;
export type CounterChannel = z.infer<typeof counterChannelSchema>;
export type MemberCounterConfig = z.infer<typeof memberCounterConfigSchema>;
export const defaultMemberCounterConfig: MemberCounterConfig = memberCounterConfigSchema.parse({});