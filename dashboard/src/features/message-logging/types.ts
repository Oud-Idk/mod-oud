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
    id: z.coerce.number(),
    message_id: z.string(),
    author_id: z.string(),
    channel_id: z.string(),
    deleted_by_id: z.string().nullish().default(null),
    guild_id: z.string(),
    content: z.string().default(""),
    attachment_url: z.string().nullish().default(null),
    deleted_at: z.coerce.date().transform((d) => d.toISOString()),
});

export const editedMessageSchema = z.object({
    id: z.coerce.number(),
    message_id: z.string(),
    author_id: z.string(),
    channel_id: z.string(),
    guild_id: z.string(),
    old_content: z.string().nullish().default(null),
    new_content: z.string().nullish().default(null),
    updated_at: z.coerce.date().transform((d) => d.toISOString()),
});

export type DeletedMessage = z.infer<typeof deletedMessageSchema>;
export type MessageLoggingConfig = z.infer<typeof messageLoggingConfigSchema>;
export type EditedMessage = z.infer<typeof editedMessageSchema>;

export const defaultMessageLoggingConfig: MessageLoggingConfig = messageLoggingConfigSchema.parse({});