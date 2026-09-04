import { z } from "zod";
import {
    DEFAULT_TOGGLABLE_MESSAGE_LAYOUT,
    messageLayoutSchema,
    TogglableMessageSchema,
} from "@/features/_shared/embed";

export const publicWelcomeConfigSchema = z.object({
    enabled: z.boolean().default(false),
    channel_id: z.string().nullish().default(null),
    message: messageLayoutSchema.default({
        format: "EMBED",
        content: "",
        embed: {},
    }),
});

export const privateWelcomeConfigSchema = TogglableMessageSchema;

export const welcomeConfigSchema = z.object({
    public: publicWelcomeConfigSchema.default({
        enabled: false,
        channel_id: null,
        message: {
            format: "EMBED",
            content: "",
            embed: {},
        },
    }),
    private: privateWelcomeConfigSchema.default(DEFAULT_TOGGLABLE_MESSAGE_LAYOUT),
    joinRoleIds: z.array(z.string()).default([]),
});

export const saveWelcomeConfigSchema = welcomeConfigSchema.superRefine((data, ctx) => {
    if (data.public.enabled && (data.public.channel_id === null || data.public.channel_id.trim() === "")) {
        ctx.addIssue({
            code: 'custom',
            message: "Please select a channel for public welcome messages.",
            path: ["public", "channel_id"],
        });
    }
});

export type PublicWelcomeConfig = z.infer<typeof publicWelcomeConfigSchema>;
export type PrivateWelcomeConfig = z.infer<typeof privateWelcomeConfigSchema>;
export type WelcomeConfig = z.infer<typeof welcomeConfigSchema>;