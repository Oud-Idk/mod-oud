import { invalidateGuildChannelCache } from "@/features/_shared/channels";
import { backendFetch } from "@/lib/backend";
import { z } from "zod";
import { getVerificationConfig, saveVerificationConfig } from "./queries";
import {
    type VerificationConfig,
    type TeardownVerificationPayload,
} from "./types";
import { MessageLayout } from "@/features/_shared/embed";

// Backend wire shape for POST /api/guilds/:id/verification — kept inline here
// (not in types.ts) since no other part of the feature should import it.
const setupBackendResponseSchema = z.object({
    verification_message_id: z.string(),
    verification_channel_id: z.string(),
    verification_role_id: z.string(),
});

export interface SetupVerificationResult {
    verificationMessageId: string;
    verificationChannelId: string;
    verificationRoleId: string;
}

export async function setupVerificationService(
    guildId: string,
    payload: MessageLayout
): Promise<SetupVerificationResult> {
    const response = await backendFetch(`/api/guilds/${guildId}/verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    if (!response.ok) {
        const errText = (await response.text()).trim();
        throw new Error(errText !== "" ? errText : "The backend application rejected the verification setup request.");
    }

    const data = setupBackendResponseSchema.parse(await response.json());

    try {
        await invalidateGuildChannelCache(guildId);
    } catch (cacheErr) {
        console.error("Could not reset the Discord channels cache list:", cacheErr);
    }

    const currentConfig = await getVerificationConfig(guildId);
    const updatedConfig: VerificationConfig = {
        ...currentConfig,
        enabled: true,
        verificationMessageId: data.verification_message_id,
        verificationChannelId: data.verification_channel_id,
        verificationRoleId: data.verification_role_id,
        message: payload,
    };

    await saveVerificationConfig(guildId, updatedConfig);

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
    const response = await backendFetch(`/api/guilds/${guildId}/verification`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            verification_channel_id: payload.verification_channel_id,
            verification_role_id: payload.verification_role_id,
        }),
    });

    if (!response.ok) {
        const errText = (await response.text()).trim();
        throw new Error(errText !== "" ? errText : "The backend application rejected the verification removal request.");
    }

    try {
        await invalidateGuildChannelCache(guildId);
    } catch (cacheErr) {
        console.error("Could not reset the Discord channels cache list:", cacheErr);
    }

    const currentConfig = await getVerificationConfig(guildId);
    const updatedConfig: VerificationConfig = {
        ...currentConfig,
        enabled: false,
        verificationMessageId: null,
        verificationChannelId: null,
        verificationRoleId: null,
    };

    await saveVerificationConfig(guildId, updatedConfig);
}
