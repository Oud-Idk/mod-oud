import { z } from "zod";

export const messageLoggingConfigSchema = z.object({
    ignoredChannels: z.array(z.string()).default([]),
    ignoredRoles: z.array(z.string()).default([]),
    ignoredUsers: z.array(z.string()).default([]),
    events: z
        .object({
            messageDelete: z.boolean().default(false),
            messageEdit: z.boolean().default(false),
        })
        .default({ messageDelete: false, messageEdit: false }),
});


export const deletedMessageSchema = z.object({
    id: z.number(),
    message_id: z.string(),
    author_id: z.string(),
    channel_id: z.string(),
    deleted_by_id: z.string().nullish().transform((val) => val ?? ""),
    guild_id: z.string(),
    content: z.string(),
    attachment_url: z.string().nullish().transform((val) => val ?? ""),
    deleted_at: z
        .union([z.date(), z.string()])
        .transform((val) => (val instanceof Date ? val.toISOString() : val)),
});


export const editedMessageSchema = z.object({
    id: z.number(),
    message_id: z.string(),
    author_id: z.string(),
    channel_id: z.string(),
    guild_id: z.string(),
    old_content: z.string().nullable(),
    new_content: z.string().nullable(),
    updated_at: z
        .union([z.date(), z.string()])
        .transform((val) => (val instanceof Date ? val.toISOString() : val)),
});

export type DeletedMessage = z.infer<typeof deletedMessageSchema>;
export type MessageLoggingConfig = z.infer<typeof messageLoggingConfigSchema>;
export type EditedMessage = z.infer<typeof editedMessageSchema>;