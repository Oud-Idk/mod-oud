import { invalidateGuildChannelCache } from "@/features/_shared/channels";
import { getWelcomeConfig, saveWelcomeConfig } from "./queries";
import {
    setupBackendResponseSchema,
    type SetupVerificationResult,
    type WelcomeConfig, TeardownVerificationPayload,
} from "./types";
import { MessageLayout } from "@/features/_shared/embed";

const getBackendUrl = (): string => process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";

export async function setupVerificationService(
    guildId: string,
    payload: MessageLayout
): Promise<SetupVerificationResult> {
    const response = await fetch(`${getBackendUrl()}/api/guilds/${guildId}/verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
            message: payload,
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
    payload: TeardownVerificationPayload
): Promise<void> {
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