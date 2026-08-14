import { z } from "zod";
import { DEFAULT_MESSAGE_LAYOUT, messageLayoutSchema } from "@/features/_shared/embed";

export const reactionRoleModeSchema = z.enum(["REACTION", "BUTTON"]);
export const buttonStyleSchema = z.enum(["PRIMARY", "SECONDARY", "SUCCESS", "DANGER"]);

export const reactionRoleItemSchema = z.object({
    emoji: z.string().default(""),
    role_id: z.string().nullish(),
});

export const buttonRoleItemSchema = z.object({
    role_id: z.string().nullish(),
    custom_id: z.string(),
    label: z.string().nullish(),
    style: buttonStyleSchema.default("PRIMARY"),
    emoji: z.string().nullish(),
});

export const saveReactionMessageInputSchema = z
    .object({
        id: z.coerce.number().optional(),
        name: z.string().min(1, "Name is required"),
        message_id: z.string().nullish(),
        channel_id: z.string().nullish(),
        guild_id: z.string().min(1, "Guild ID is required"),
        mode: reactionRoleModeSchema.default("REACTION"),
        reactions: z.array(reactionRoleItemSchema).default([]),
        buttons: z.array(buttonRoleItemSchema).default([]),
        message: messageLayoutSchema.default(DEFAULT_MESSAGE_LAYOUT),
    })
    .superRefine((data, ctx) => {
        if (!data.channel_id || data.channel_id.trim() === "") {
            ctx.addIssue({
                code: 'custom',
                message: "Please select a target channel.",
                path: ["channel_id"],
            });
        }

        if (data.mode === "REACTION") {
            if (data.reactions.length === 0) {
                ctx.addIssue({
                    code: 'custom',
                    message: "At least one reaction mapping is required.",
                    path: ["reactions"],
                });
            }
            data.reactions.forEach((item, index) => {
                if (!item.emoji || item.emoji.trim() === "") {
                    ctx.addIssue({
                        code: 'custom',
                        message: `Reaction #${index + 1} requires an emoji.`,
                        path: ["reactions", index, "emoji"],
                    });
                }
                if (!item.role_id || item.role_id.trim() === "") {
                    ctx.addIssue({
                        code: 'custom',
                        message: `Reaction #${index + 1} requires an assigned role.`,
                        path: ["reactions", index, "role_id"],
                    });
                }
            });
        }

        if (data.mode === "BUTTON") {
            if (data.buttons.length === 0) {
                ctx.addIssue({
                    code: 'custom',
                    message: "At least one button mapping is required.",
                    path: ["buttons"],
                });
            }
            data.buttons.forEach((item, index) => {
                if (!item.role_id || item.role_id.trim() === "") {
                    ctx.addIssue({
                        code: 'custom',
                        message: `Button #${index + 1} requires an assigned role.`,
                        path: ["buttons", index, "role_id"],
                    });
                }
            });
        }
    });

export const reactionMessageSchema = z.object({
    id: z.coerce.number(),
    name: z.string(),
    message_id: z.string().nullish(),
    channel_id: z.string().nullish(),
    guild_id: z.string(),
    mode: reactionRoleModeSchema.default("REACTION"),
    message: messageLayoutSchema.default({
        format: "EMBED",
        content: "Please complete the verification below to gain access to the server.",
        embed: { },
    }),
    content: z.string().nullish().default(""),
    reactions: z.array(reactionRoleItemSchema).default([]),
    buttons: z.array(buttonRoleItemSchema).default([]),
});

export type ReactionRoleItem = z.infer<typeof reactionRoleItemSchema>;
export type ButtonRoleItem = z.infer<typeof buttonRoleItemSchema>;
export type SaveReactionMessageData = z.infer<typeof saveReactionMessageInputSchema>;
export type SaveReactionMessageInput = z.input<typeof saveReactionMessageInputSchema>;
export type ReactionMessage = z.infer<typeof reactionMessageSchema>;