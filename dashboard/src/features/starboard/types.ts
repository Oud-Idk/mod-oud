import { z } from "zod";

import { DiscordEmbed } from "@/features/_shared/embed";

export const starboardConfigInputSchema = z.object({
    id: z.string().optional(),
    starboard_channel_id: z.string().min(1, "Starboard channel is required"),
    emojis: z.array(z.string()).default(["⭐"]),
    reaction_threshold: z.number().min(1).default(3),
    min_message_age: z.string().nullable().optional().default(null),
    max_message_age: z.string().nullable().optional().default(null),
    prevent_self_star: z.boolean().default(true),
    allow_bot_messages: z.boolean().default(false),
    role_restriction_type: z.enum(["NONE", "ALL_EXCEPT", "ONLY_THESE"]).default("NONE"),
    restricted_roles: z.array(z.string()).default([]),
    channel_restriction_type: z.enum(["NONE", "ALL_EXCEPT", "ONLY_THESE"]).default("NONE"),
    restricted_channels: z.array(z.string()).default([]),
    embed_template: z.custom<DiscordEmbed>().default({}),
    plaintext_template: z.string().default(""),
    keep_deleted_messages: z.boolean().default(true),
});

export const starboardConfigSchema = starboardConfigInputSchema.extend({
    id: z.coerce.string(),
    guild_id: z.string(),
    created_at: z.coerce.string(),
    updated_at: z.coerce.string(),
});

export type StarboardConfigInput = z.input<typeof starboardConfigInputSchema>;
export type StarboardConfig = z.infer<typeof starboardConfigSchema>;
