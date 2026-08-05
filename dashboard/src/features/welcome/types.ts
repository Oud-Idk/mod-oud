import { z } from "zod";
import { DiscordEmbed, Format } from "@/features/_shared/embed";

export type CaptchaType = 'TURNSTILE' | 'HCAPTCHA';

const defaultVerificationEmbed: DiscordEmbed = {
    title: "Server Verification Required",
    description:
        "Click the verification button below to verify your account and gain full access.",
    color: 0x55ee77,
};

// 2. Sub-schemas
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
    verificationMessageId: z.string().optional().default(""),
    verificationChannelId: z.string().optional().default(""),
    verificationRoleId: z.string().optional().default(""),
    content: z
        .string()
        .optional()
        .default("Please complete the verification below to gain access to the server."),
    embed: discordEmbedSchema.default(defaultVerificationEmbed),
    format: z.custom<Format>().default("EMBED"),
});

// 3. Derived Sub-types
export type PublicWelcomeConfig = z.infer<typeof publicWelcomeConfigSchema>;
export type PrivateWelcomeConfig = z.infer<typeof privateWelcomeConfigSchema>;
export type VerificationConfig = z.infer<typeof verificationConfigSchema>;

// 4. Fully satisfied default objects for parent schema (fixes TS2769 error)
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
    verificationMessageId: "",
    verificationChannelId: "",
    verificationRoleId: "",
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