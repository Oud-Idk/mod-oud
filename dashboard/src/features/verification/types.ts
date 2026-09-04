import { z } from "zod";
import {
    messageLayoutSchema,
    type DiscordEmbed,
} from "@/features/_shared/embed";

export const captchaTypeSchema = z.enum(["TURNSTILE", "HCAPTCHA"]);

export type CaptchaType = z.infer<typeof captchaTypeSchema>;

const defaultVerificationEmbed: DiscordEmbed = {
    title: "Server Verification Required",
    description: "Click the verification button below to verify your account and gain full access.",
    color: 0x55ee77,
};

export const verificationConfigSchema = z.object({
    enabled: z.boolean().default(false),
    useOauth: z.boolean().default(false),
    captchaType: captchaTypeSchema.default("TURNSTILE"),
    verificationMessageId: z.string().nullish().default(null),
    verificationChannelId: z.string().nullish().default(null),
    verificationRoleId: z.string().nullish().default(null),
    message: messageLayoutSchema.default({
        format: "EMBED",
        content: "Please complete the verification below to gain access to the server.",
        embed: defaultVerificationEmbed,
    }),
});

// NOTE: intentionally a plain alias, not a `.superRefine()` strict-save schema.
// The setup flow requires saving `enabled: true` BEFORE bindings exist:
// VerificationBody's Setup tab only offers "Set Up Verification System" once
// enabled, and setupVerificationService fills in channel/role/message ids.
// Requiring bindings here would make first-time setup unsaveable.
export const saveVerificationConfigSchema = verificationConfigSchema;

export const teardownVerificationPayloadSchema = z.object({
    verification_channel_id: z.string().min(1, "Verification Channel ID is required"),
    verification_role_id: z.string().min(1, "Verification Role ID is required"),
});

export type VerificationConfig = z.infer<typeof verificationConfigSchema>;
export type TeardownVerificationPayload = z.infer<typeof teardownVerificationPayloadSchema>;
