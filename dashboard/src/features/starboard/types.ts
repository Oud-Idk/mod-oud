import { z } from "zod";
import { DiscordEmbedSchema } from "@/features/_shared/embed";

const intervalRegex = /^(\d+\s+(year|month|week|day|hour|minute|second)s?(\s+|$))+$/i;

function isValidInterval(val: string | null | undefined): boolean {
    if (!val || val.trim() === "") return true;
    return intervalRegex.test(val.trim());
}

export const starboardConfigInputSchema = z
    .object({
        id: z.string().optional(),
        starboard_channel_id: z.string().nullish().default(null),
        emojis: z.array(z.string()).default(["⭐"]),
        reaction_threshold: z.number().min(1, "Threshold must be at least 1").default(3),
        min_message_age: z.string().nullish().default(null),
        max_message_age: z.string().nullish().default(null),
        prevent_self_star: z.boolean().default(true),
        allow_bot_messages: z.boolean().default(false),
        role_restriction_type: z.enum(["NONE", "ALL_EXCEPT", "ONLY_THESE"]).default("NONE"),
        restricted_roles: z.array(z.string()).default([]),
        channel_restriction_type: z.enum(["NONE", "ALL_EXCEPT", "ONLY_THESE"]).default("NONE"),
        restricted_channels: z.array(z.string()).default([]),
        embed_template: DiscordEmbedSchema.optional().default({}),
        plaintext_template: z.string().default(""),
        keep_deleted_messages: z.boolean().default(true),
    })
    .superRefine((data, ctx) => {
        if (!data.starboard_channel_id || data.starboard_channel_id.trim() === "") {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "Please select a destination channel for the starboard.",
                path: ["starboard_channel_id"],
            });
        }

        if (data.emojis.length === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: "At least one reaction emoji is required.",
                path: ["emojis"],
            });
        }

        if (data.min_message_age && !isValidInterval(data.min_message_age)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Invalid min message age format (e.g. "1 hour", "30 minutes").',
                path: ["min_message_age"],
            });
        }

        if (data.max_message_age && !isValidInterval(data.max_message_age)) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'Invalid max message age format (e.g. "90 days", "7 days").',
                path: ["max_message_age"],
            });
        }
    });

export const starboardConfigSchema = z.object({
    id: z.coerce.string(),
    guild_id: z.string(),
    starboard_channel_id: z.string().nullish().default(null),
    emojis: z.array(z.string()).default(["⭐"]),
    reaction_threshold: z.number().default(3),
    min_message_age: z.string().nullish().default(null),
    max_message_age: z.string().nullish().default(null),
    prevent_self_star: z.boolean().default(true),
    allow_bot_messages: z.boolean().default(false),
    role_restriction_type: z.enum(["NONE", "ALL_EXCEPT", "ONLY_THESE"]).default("NONE"),
    restricted_roles: z.array(z.string()).default([]),
    channel_restriction_type: z.enum(["NONE", "ALL_EXCEPT", "ONLY_THESE"]).default("NONE"),
    restricted_channels: z.array(z.string()).default([]),
    embed_template: DiscordEmbedSchema.optional().default({}),
    plaintext_template: z.string().default(""),
    keep_deleted_messages: z.boolean().default(true),
    created_at: z.coerce.string(),
    updated_at: z.coerce.string(),
});

export type StarboardConfigInput = z.input<typeof starboardConfigInputSchema>;
export type SaveableStarboardConfig = z.infer<typeof starboardConfigInputSchema>;
export type StarboardConfig = z.infer<typeof starboardConfigSchema>;