import { z } from "zod";
import { DiscordEmbedSchema } from "@/features/_shared/embed";

const intervalRegex = /^(\d+\s+(year|month|week|day|hour|minute|second)s?(\s+|$))+$/i;

const restrictionTypeEnum = z.enum(["NONE", "ALL_EXCEPT", "ONLY_THESE"]);

export const starboardConfigInputSchema = z.object({
    id: z.string().optional(),
    starboard_channel_id: z
        .string({ error: "Please select a destination channel for the starboard." })
        .trim()
        .min(1, "Please select a destination channel for the starboard."),
    emojis: z
        .array(z.string())
        .min(1, "At least one reaction emoji is required.")
        .default(["⭐"]),
    reaction_threshold: z
        .number({ error: "Threshold must be a number" })
        .int("Threshold must be a whole number")
        .min(1, "Threshold must be at least 1")
        .default(3),
    min_message_age: z
        .string()
        .trim()
        .refine((val: string): boolean => val === "" || intervalRegex.test(val), {
            message: 'Invalid min message age format (e.g. "1 hour", "30 minutes").',
        })
        .transform((val: string): string | null => (val === "" ? null : val))
        .nullable()
        .default(null),
    max_message_age: z
        .string()
        .trim()
        .refine((val: string): boolean => val === "" || intervalRegex.test(val), {
            message: 'Invalid max message age format (e.g. "90 days", "7 days").',
        })
        .transform((val: string): string | null => (val === "" ? null : val))
        .nullable()
        .default(null),
    prevent_self_star: z.boolean().default(true),
    allow_bot_messages: z.boolean().default(false),
    keep_deleted_messages: z.boolean().default(true),
    role_restriction_type: restrictionTypeEnum.default("NONE"),
    restricted_roles: z.array(z.string()).default([]),
    channel_restriction_type: restrictionTypeEnum.default("NONE"),
    restricted_channels: z.array(z.string()).default([]),
    embed_template: DiscordEmbedSchema.optional().default({}),
    plaintext_template: z.string().default(""),
});

export const starboardConfigSchema = z.object({
    id: z.coerce.string(),
    guild_id: z.string(),
    starboard_channel_id: z.string().nullable().default(null),
    emojis: z.array(z.string()).default(["⭐"]),
    reaction_threshold: z.number().default(3),
    min_message_age: z.string().nullable().default(null),
    max_message_age: z.string().nullable().default(null),
    prevent_self_star: z.boolean().default(true),
    allow_bot_messages: z.boolean().default(false),
    role_restriction_type: restrictionTypeEnum.default("NONE"),
    restricted_roles: z.array(z.string()).default([]),
    channel_restriction_type: restrictionTypeEnum.default("NONE"),
    restricted_channels: z.array(z.string()).default([]),
    embed_template: DiscordEmbedSchema.optional().default({}),
    plaintext_template: z.string().default(""),
    keep_deleted_messages: z.boolean().default(true),
    created_at: z.coerce.string(),
    updated_at: z.coerce.string(),
});

export type StarboardConfigInput = z.input<typeof starboardConfigInputSchema>;
export type SaveableStarboardConfig = z.infer<typeof starboardConfigInputSchema>;

/// Form-draft shape for the editor: `starboard_channel_id` may be transiently
/// null while editing. Saving stays gated by `starboardConfigInputSchema`,
/// whose "Please select a destination channel" message surfaces via the
/// editor banner and error toast.
export type StarboardConfigDraft = Omit<StarboardConfigInput, "starboard_channel_id"> & {
    starboard_channel_id: string | null;
};
export type StarboardConfig = z.infer<typeof starboardConfigSchema>;