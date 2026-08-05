// src/features/reaction-roles/types.ts
import { z } from "zod";

import { DiscordEmbed } from "@/features/_shared/embed";

export const formatSchema = z.enum(["EMBED", "TEXT"]);
export const reactionRoleModeSchema = z.enum(["REACTION", "BUTTON"]);

export type Format = z.infer<typeof formatSchema>;
export type ReactionRoleMode = z.infer<typeof reactionRoleModeSchema>;

export const reactionRoleItemSchema = z.object({
    emoji: z.string(),
    role_id: z.string(),
});

export const buttonRoleItemSchema = z.object({
    role_id: z.string(),
    custom_id: z.string(),
    label: z.string().nullable().optional(),
    style: z.string().default("PRIMARY"),
    emoji: z.string().nullable().optional(),
});

export const saveReactionMessageInputSchema = z.object({
    id: z.number().optional(), // 👈 Optional for creation, present for updates
    name: z.string().min(1, "Name is required"),
    message_id: z.string().nullable().optional(),
    channel_id: z.string().min(1, "Channel is required"),
    guild_id: z.string(),
    format: formatSchema.default("TEXT"),
    mode: reactionRoleModeSchema.default("REACTION"),
    embed: z.custom<DiscordEmbed>(),
    content: z.string().nullable().optional().default(""),
    reactions: z.array(reactionRoleItemSchema).optional().default([]),
    buttons: z.array(buttonRoleItemSchema).optional().default([]),
});

export const reactionMessageSchema = saveReactionMessageInputSchema.extend({
    id: z.number(),
});

export type ReactionRoleItem = z.infer<typeof reactionRoleItemSchema>;
export type ButtonRoleItem = z.infer<typeof buttonRoleItemSchema>;
export type SaveReactionMessageData = z.infer<typeof saveReactionMessageInputSchema>;
export type SaveReactionMessageInput = z.input<typeof saveReactionMessageInputSchema>;
export type ReactionMessage = z.infer<typeof reactionMessageSchema>;