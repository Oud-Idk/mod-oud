import { z } from "zod";

import { DiscordEmbed } from "@/features/_shared/embed";

export const cooldownTypeSchema = z.enum(["NONE", "USER", "SERVER"]);
export const customMessageFormatSchema = z.enum(["EMBED", "TEXT"]);

export const customMessagePayloadSchema = z.object({
    format: customMessageFormatSchema.default("TEXT"),
    content: z.string().nullable().optional().default(""),
    embed: z.custom<DiscordEmbed>().optional(),
});

/** Discriminated union handling all available custom command actions cleanly */
export const commandActionSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("send_channel_message"),
        data: z.object({
            channel_id: z.string(),
            messages: z.array(customMessagePayloadSchema),
            randomize: z.boolean().default(false),
        }),
    }),
    z.object({
        type: z.literal("respond_current_channel"),
        data: z.object({
            is_dm: z.boolean().default(false),
            is_ephemeral: z.boolean().default(false),
            messages: z.array(customMessagePayloadSchema),
            randomize: z.boolean().default(false),
        }),
    }),
    z.object({
        type: z.literal("add_role"),
        data: z.object({
            role_id: z.string(),
        }),
    }),
    z.object({
        type: z.literal("remove_role"),
        data: z.object({
            role_id: z.string(),
        }),
    }),
]);

export const saveCustomCommandInputSchema = z.object({
    id: z.number().optional(),
    guild_id: z.string(),
    name: z.string().min(1, "Name is required"),
    description: z.string().nullable().optional().default(""),
    enabled: z.boolean().default(true),
    delete_trigger: z.boolean().default(false),
    cooldown_type: cooldownTypeSchema.default("NONE"),
    cooldown_seconds: z.number().default(0),
    allowed_roles: z.array(z.string()).default([]),
    ignored_roles: z.array(z.string()).default([]),
    allowed_channels: z.array(z.string()).default([]),
    ignored_channels: z.array(z.string()).default([]),
    actions: z.array(commandActionSchema).default([]),
});

export const customCommandSchema = saveCustomCommandInputSchema.extend({
    id: z.number(),
});

export type CooldownType = z.infer<typeof cooldownTypeSchema>;
export type CustomMessagePayload = z.infer<typeof customMessagePayloadSchema>;
export type CommandAction = z.infer<typeof commandActionSchema>;
export type SaveCustomCommandData = z.infer<typeof saveCustomCommandInputSchema>;
export type SaveCustomCommandInput = z.input<typeof saveCustomCommandInputSchema>;
export type CustomCommand = z.infer<typeof customCommandSchema>;