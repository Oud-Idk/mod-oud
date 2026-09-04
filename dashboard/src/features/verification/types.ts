import { z } from "zod";
import {
    messageLayoutSchema,
    type DiscordEmbed,
} from "@/features/_shared/embed";

export type CaptchaType = "TURNSTILE" | "HCAPTCHA";

const defaultVerificationEmbed: DiscordEmbed = {
    title: "Server Verification Required",
    description: "Click the verification button below to verify your account and gain full access.",
    color: 0x55ee77,
};

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

export const saveVerificationConfigSchema = verificationConfigSchema;

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

export type VerificationConfig = z.infer<typeof verificationConfigSchema>;
export type TeardownVerificationPayload = z.infer<typeof teardownVerificationPayloadSchema>;
export type SetupVerificationPayload = z.infer<typeof setupVerificationPayloadSchema>;

export interface SetupVerificationResult {
    verificationMessageId: string;
    verificationChannelId: string;
    verificationRoleId: string;
}
