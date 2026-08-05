import { z } from "zod";
import { WelcomeConfig } from "@/features/welcome/types";
import { invalidateGuildChannelCache } from "@/features/_shared/channels";
import { getWelcomeConfig, saveWelcomeConfig } from "@/features/welcome/queries";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { DiscordEmbed, Format } from "@/features/_shared/embed";

export const setupVerificationPayloadSchema = z.object({
    content: z.string().optional(),
    embed: z.custom<DiscordEmbed>().optional(),
    format: z.custom<Format>(),
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

export interface SetupVerificationResult {
    verificationMessageId: string;
    verificationChannelId: string;
    verificationRoleId: string;
}


const getBackendUrl = (): string => process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";

export async function setupVerificationService(
    guildId: string,
    rawPayload: unknown
): Promise<SetupVerificationResult> {
    const payloadResult = setupVerificationPayloadSchema.safeParse(rawPayload);
    if (!payloadResult.success) {
        throw new Error(payloadResult.error.issues[0]?.message || "Invalid setup parameters provided.");
    }
    const payload = payloadResult.data;

    await verifyGuildAccess(guildId);

    let parsedEmbed = null;
    if (payload.format === "EMBED" && payload.embed) {
        try {
            parsedEmbed = typeof payload.embed === "string" ? JSON.parse(payload.embed) : payload.embed;
        } catch {
            throw new Error("Invalid JSON syntax detected in the Embed schema.");
        }
    }

    const response = await fetch(`${getBackendUrl()}/api/guilds/${guildId}/verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            content: payload.content || null,
            embed: parsedEmbed,
            format: payload.format,
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "The backend application rejected the verification setup request.");
    }

    const rawData = await response.json();
    const dataResult = setupBackendResponseSchema.safeParse(rawData);
    if (!dataResult.success) {
        throw new Error("Received an invalid or malformed payload from the backend service.");
    }

    const data = dataResult.data;

    try {
        await invalidateGuildChannelCache(guildId);
    } catch (cacheErr) {
        console.error("Could not reset the Discord channels cache list:", cacheErr);
    }

    const currentConfig = await getWelcomeConfig(guildId);
    const updatedConfig: WelcomeConfig = {
        ...currentConfig,
        verification: {
            ...currentConfig.verification,
            enabled: true,
            verificationMessageId: data.verification_message_id,
            verificationChannelId: data.verification_channel_id,
            verificationRoleId: data.verification_role_id,
            content: payload.content || currentConfig.verification.content,
            embed: payload.embed || currentConfig.verification.embed,
            format: payload.format,
        },
    };

    await saveWelcomeConfig(guildId, updatedConfig);

    return {
        verificationMessageId: data.verification_message_id,
        verificationChannelId: data.verification_channel_id,
        verificationRoleId: data.verification_role_id,
    };
}

export async function teardownVerificationService(
    guildId: string,
    rawPayload: unknown
): Promise<void> {
    const payloadResult = teardownVerificationPayloadSchema.safeParse(rawPayload);
    if (!payloadResult.success) {
        throw new Error(payloadResult.error.issues[0]?.message || "Invalid teardown parameters provided.");
    }
    const payload = payloadResult.data;

    await verifyGuildAccess(guildId);

    const response = await fetch(`${getBackendUrl()}/api/guilds/${guildId}/verification`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            verification_channel_id: payload.verification_channel_id,
            verification_role_id: payload.verification_role_id,
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "The backend application rejected the verification removal request.");
    }

    try {
        await invalidateGuildChannelCache(guildId);
    } catch (cacheErr) {
        console.error("Could not reset the Discord channels cache list:", cacheErr);
    }

    const currentConfig = await getWelcomeConfig(guildId);
    const updatedConfig: WelcomeConfig = {
        ...currentConfig,
        verification: {
            ...currentConfig.verification,
            enabled: false,
            verificationMessageId: "",
            verificationChannelId: "",
            verificationRoleId: "",
        },
    };

    await saveWelcomeConfig(guildId, updatedConfig);
}