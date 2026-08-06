import { z } from "zod";

import { DiscordEmbed } from "@/features/_shared/embed";

export const messageFormatSchema = z.enum(["EMBED", "TEXT"]);

export const customMessagePayloadSchema = z.object({
    format: messageFormatSchema.default("TEXT"),
    content: z.string().nullable().optional().default(""),
    embed: z.custom<DiscordEmbed>().optional().default({}),
});

export const birthdayConfigInputSchema = z.object({
    enabled: z.boolean().default(false),
    channelId: z.string().nullable().optional().default(""),
    announcementHour: z.number().min(0).max(23).default(9),
    timezone: z.string().default("UTC"),
    birthdayRoleId: z.string().nullable().optional().default(""),
    requireYear: z.boolean().default(false),
    messageWithYear: customMessagePayloadSchema.default({
        format: "TEXT",
        content: "Happy birthday!\n{user.list}!\n🎉",
        embed: {},
    }),
    messageWithoutYear: customMessagePayloadSchema.default({
        format: "TEXT",
        content: "Happy birthday!\n{user.list}!\n🎉",
        embed: {},
    }),
});

export const birthdayConfigSchema = birthdayConfigInputSchema;

export type CustomMessagePayload = z.infer<typeof customMessagePayloadSchema>;
export type BirthdayConfigInput = z.input<typeof birthdayConfigInputSchema>;
export type BirthdayConfig = z.infer<typeof birthdayConfigSchema>;