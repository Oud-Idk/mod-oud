import { z } from "zod";
import { messageLayoutSchema, MessageLayout } from "@/features/_shared/embed";

export const cooldownTypeSchema = z.enum(["NONE", "USER", "SERVER"]);

/** Reusable schema for the message_layout sub-field */
export const messageLayoutGroupSchema = z.object({
    messages: z.array(messageLayoutSchema).min(1, "At least one message is required"),
    randomize: z.boolean().default(false),
});

/** Discriminated union handling all available custom command actions cleanly */
export const commandActionSchema = z.discriminatedUnion("type", [
    z.object({
        type: z.literal("send_channel_message"),
        data: z.object({
            channel_id: z.string().min(1, "Target channel is required"),
            message_layout: messageLayoutGroupSchema,
        }),
    }),
    z.object({
        type: z.literal("respond_current_channel"),
        data: z.object({
            is_dm: z.boolean().default(false),
            is_ephemeral: z.boolean().default(false),
            message_layout: messageLayoutGroupSchema,
        }),
    }),
    z.object({
        type: z.literal("add_role"),
        data: z.object({
            role_id: z.string().min(1, "Role is required"),
        }),
    }),
    z.object({
        type: z.literal("remove_role"),
        data: z.object({
            role_id: z.string().min(1, "Role is required"),
        }),
    }),
]);

export const saveCustomCommandInputSchema = z.object({
    id: z.coerce.number().optional(),
    guild_id: z.coerce.string(),
    name: z
        .string()
        .min(1, "Command name is required")
        .regex(/^[a-zA-Z0-9_-]+$/, "Name can only contain letters, numbers, hyphens, and underscores"),
    description: z.string().nullish().default(""),
    enabled: z.boolean().default(true),
    delete_trigger: z.boolean().default(false),
    cooldown_type: cooldownTypeSchema.default("NONE"),
    cooldown_seconds: z.number().nonnegative().default(0),
    allowed_roles: z.array(z.coerce.string()).default([]),
    ignored_roles: z.array(z.coerce.string()).default([]),
    allowed_channels: z.array(z.coerce.string()).default([]),
    ignored_channels: z.array(z.coerce.string()).default([]),
    actions: z.array(commandActionSchema).default([]),
});

export const customCommandSchema = saveCustomCommandInputSchema.extend({
    id: z.coerce.number(),
});

// Strict Save Validation Schema
export const SaveCustomCommandSchema = saveCustomCommandInputSchema.superRefine((data, ctx) => {
    if (data.enabled) {
        if (!data.actions || data.actions.length === 0) {
            ctx.addIssue({
                code: 'custom',
                message: "At least one action is required for a custom command!",
                path: ["actions"],
            });
        }
    }
});

export type CooldownType = z.infer<typeof cooldownTypeSchema>;
export type CommandAction = z.infer<typeof commandActionSchema>;
export type SaveCustomCommandData = z.infer<typeof saveCustomCommandInputSchema>;
export type CustomCommand = z.infer<typeof customCommandSchema>;
export type { MessageLayout };