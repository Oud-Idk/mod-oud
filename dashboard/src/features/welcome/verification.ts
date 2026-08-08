import { invalidateGuildChannelCache } from "@/features/_shared/channels";
import { getWelcomeConfig, saveWelcomeConfig } from "./queries";
import {
    setupBackendResponseSchema,
    setupVerificationPayloadSchema,
    teardownVerificationPayloadSchema,
    type SetupVerificationResult,
    type WelcomeConfig,
} from "./types";

const getBackendUrl = (): string => process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";

export async function setupVerificationService(
    guildId: string,
    rawPayload: unknown
): Promise<SetupVerificationResult> {
    const payload = setupVerificationPayloadSchema.parse(rawPayload);

    let parsedEmbed = null;
    if (payload.message.format === "EMBED" && payload.message.embed) {
        parsedEmbed = typeof payload.message.embed === "string"
            ? JSON.parse(payload.message.embed)
            : payload.message.embed;
    }

    const response = await fetch(`${getBackendUrl()}/api/guilds/${guildId}/verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            content: payload.message.content || null,
            embed: parsedEmbed,
            format: payload.message.format,
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "The backend application rejected the verification setup request.");
    }

    const rawData = await response.json();
    const data = setupBackendResponseSchema.parse(rawData);

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
            message: {
                format: payload.message.format,
                content: payload.message.content || currentConfig.verification.message.content,
                embed: payload.message.embed || currentConfig.verification.message.embed,
            },
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
    const payload = teardownVerificationPayloadSchema.parse(rawPayload);

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
            verificationMessageId: null,
            verificationChannelId: null,
            verificationRoleId: null,
        },
    };

    await saveWelcomeConfig(guildId, updatedConfig);
}