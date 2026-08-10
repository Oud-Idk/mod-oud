import { z } from "zod";

export const mediaOnlyChannelSchema = z.object({
    channelId: z.string().min(1, "Please select a channel."),
    enabled: z.boolean().default(true),
    allowImages: z.boolean().default(true),
    allowVideos: z.boolean().default(true),
    allowAudio: z.boolean().default(false),
    allowGif: z.boolean().default(true),
    allowLinks: z.boolean().default(true),
    allowEmbeddedText: z.boolean().default(true),
    autoThread: z.boolean().default(false),
    threadNameTemplate: z.string().nullable().default("Discussion - {user}"),
    deleteWarningAfterSecs: z.number().int().min(0).max(120).default(5),
    exemptRoles: z.array(z.string()).nullable().default([]).transform((v) => v ?? []),
});

export type MediaOnlyChannel = z.infer<typeof mediaOnlyChannelSchema>;
export type MediaOnlyChannelInput = z.input<typeof mediaOnlyChannelSchema>;
