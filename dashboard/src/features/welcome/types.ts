import { z } from "zod";
import {
    DEFAULT_TOGGLABLE_MESSAGE_LAYOUT,
    messageLayoutSchema,
    TogglableMessageSchema,
    type DiscordEmbed,
} from "@/features/_shared/embed";

export type CaptchaType = "TURNSTILE" | "HCAPTCHA";

const defaultVerificationEmbed: DiscordEmbed = {
    title: "Server Verification Required",
    description: "Click the verification button below to verify your account and gain full access.",
    color: 0x55ee77,
};

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

export const verificationConfigSchema = z.object({
    enabled: z.boolean().default(false),
    useOauth: z.boolean().default(false),
    captchaType: z.enum(["TURNSTILE", "HCAPTCHA"]).default("TURNSTILE"),
    verificationMessageId: z.string().nullish().default(null),
    verificationChannelId: z.string().nullish().default(null),
    verificationRoleId: z.string().nullish().default(null),
    message: messageLayoutSchema.default({
        format: "EMBED",
        content: "Please complete the verification below to gain access to the server.",
        embed: defaultVerificationEmbed,
    }),
});

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
    verification: verificationConfigSchema.default({
        enabled: false,
        useOauth: false,
        captchaType: "TURNSTILE",
        verificationMessageId: null,
        verificationChannelId: null,
        verificationRoleId: null,
        message: {
            format: "EMBED",
            content: "Please complete the verification below to gain access to the server.",
            embed: defaultVerificationEmbed,
        },
    }),
    joinRoleIds: z.array(z.string()).default([]),
});

export const saveWelcomeConfigSchema = welcomeConfigSchema.superRefine((data, ctx) => {
    if (data.public.enabled && (!data.public.channel_id || data.public.channel_id.trim() === "")) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "Please select a channel for public welcome messages.",
            path: ["public", "channel_id"],
        });
    }
});

export const setupVerificationPayloadSchema = z.object({
    message: messageLayoutSchema,
});

export const setupBackendResponseSchema = z.object({
    verification_message_id: z.string(),
    verification_channel_id: z.string(),
    verification_role_id: z.string(),
});

export const teardownVerificationPayloadSchema = z.object({
    verification_channel_id: z.string().min(1, "Verification Channel ID is required"),
    verification_role_id: z.string().min(1, "Verification Role ID is required"),
});

export type PublicWelcomeConfig = z.infer<typeof publicWelcomeConfigSchema>;
export type PrivateWelcomeConfig = z.infer<typeof privateWelcomeConfigSchema>;
export type VerificationConfig = z.infer<typeof verificationConfigSchema>;
export type WelcomeConfig = z.infer<typeof welcomeConfigSchema>;

export interface SetupVerificationResult {
    verificationMessageId: string;
    verificationChannelId: string;
    verificationRoleId: string;
}