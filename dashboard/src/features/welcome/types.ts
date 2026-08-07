import { z } from "zod";
import { DiscordEmbed, Format } from "@/features/_shared/embed";

export type CaptchaType = 'TURNSTILE' | 'HCAPTCHA';

const defaultVerificationEmbed: DiscordEmbed = {
    title: "Server Verification Required",
    description:
        "Click the verification button below to verify your account and gain full access.",
    color: 0x55ee77,
};

const discordEmbedSchema = z.custom<DiscordEmbed>().default({});

export const publicWelcomeConfigSchema = z.object({
    enabled: z.boolean().default(false),
    channel_id: z.string().default(""),
    content: z.string().optional().default(""),
    embed: discordEmbedSchema,
    format: z.custom<Format>().default("EMBED"),
});

export const privateWelcomeConfigSchema = z.object({
    enabled: z.boolean().default(false),
    content: z.string().optional().default(""),
    embed: discordEmbedSchema,
    format: z.custom<Format>().default("EMBED"),
});

export const verificationConfigSchema = z.object({
    enabled: z.boolean().default(false),
    useOauth: z.boolean().default(false),
    captchaType: z.custom<CaptchaType>().default("TURNSTILE"),
    verificationMessageId: z.string().nullable().default(null),
    verificationChannelId: z.string().nullable().default(null),
    verificationRoleId: z.string().nullable().default(null),
    content: z
        .string()
        .optional()
        .default("Please complete the verification below to gain access to the server."),
    embed: discordEmbedSchema.default(defaultVerificationEmbed),
    format: z.custom<Format>().default("EMBED"),
});

export type PublicWelcomeConfig = z.infer<typeof publicWelcomeConfigSchema>;
export type PrivateWelcomeConfig = z.infer<typeof privateWelcomeConfigSchema>;
export type VerificationConfig = z.infer<typeof verificationConfigSchema>;

export const DEFAULT_PUBLIC_WELCOME_CONFIG: PublicWelcomeConfig = {
    enabled: false,
    channel_id: "",
    content: "",
    embed: {},
    format: "EMBED",
};

export const DEFAULT_PRIVATE_WELCOME_CONFIG: PrivateWelcomeConfig = {
    enabled: false,
    content: "",
    embed: {},
    format: "EMBED",
};

export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
    enabled: false,
    useOauth: false,
    captchaType: "TURNSTILE",
    verificationMessageId: null,
    verificationChannelId: null,
    verificationRoleId: null,
    content: "Please complete the verification below to gain access to the server.",
    embed: defaultVerificationEmbed,
    format: "EMBED",
};

// 5. Main Root Schema
export const welcomeConfigSchema = z.object({
    public: publicWelcomeConfigSchema.default(DEFAULT_PUBLIC_WELCOME_CONFIG),
    private: privateWelcomeConfigSchema.default(DEFAULT_PRIVATE_WELCOME_CONFIG),
    verification: verificationConfigSchema.default(DEFAULT_VERIFICATION_CONFIG),
    joinRoleIds: z.array(z.string()).default([]),
});

export type WelcomeConfig = z.infer<typeof welcomeConfigSchema>;