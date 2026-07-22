"use server";

import { verifyGuildAccess } from "@/actions/config";
import { invalidateGuildChannelCache } from "@/utils/discord";
import { getWelcomeConfig, saveWelcomeConfig } from "@/utils/db/config";
import { revalidatePath } from "next/cache";
import { WelcomeConfig } from "@/types/db/config/welcome";
import { DiscordEmbed } from "@/types/embed";
import { Format } from "@/types/db";

export interface SetupVerificationResponse {
    success: boolean;
    verificationMessageId?: string;
    verificationChannelId?: string;
    verificationRoleId?: string;
    error?: string;
}

export async function setupVerificationAction(
    guildId: string,
    payload: { content?: string; embed?: DiscordEmbed; format: Format }
): Promise<SetupVerificationResponse> {
    try {
        await verifyGuildAccess(guildId);

        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";

        let parsedEmbed = null;
        if (payload.format === "EMBED" && payload.embed) {
            try {
                parsedEmbed = typeof payload.embed === "string" ? JSON.parse(payload.embed) : payload.embed;
            } catch (err) {
                return {
                    success: false,
                    error: "Invalid JSON syntax detected in the Embed schema.",
                };
            }
        }

        const response = await fetch(`${backendUrl}/api/guilds/${guildId}/verification`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                content: payload.content || null,
                embed: parsedEmbed,
                format: payload.format,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            return {
                success: false,
                error: errText || "The backend application rejected the verification setup request.",
            };
        }

        const data = await response.json();

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
            }
        };

        await saveWelcomeConfig(guildId, updatedConfig);
        revalidatePath(`/dashboard/${guildId}/welcome`);

        return {
            success: true,
            verificationMessageId: data.verification_message_id,
            verificationChannelId: data.verification_channel_id,
            verificationRoleId: data.verification_role_id,
        };
    } catch (error: any) {
        console.error("Error setting up server verification:", error);
        return {
            success: false,
            error: error.message || "An error occurred while communicating with the backend.",
        };
    }
}

export async function teardownVerificationAction(
    guildId: string,
    payload: { verification_channel_id: string; verification_role_id: string }
) {
    try {
        await verifyGuildAccess(guildId);

        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";

        const response = await fetch(`${backendUrl}/api/guilds/${guildId}/verification`, {
            method: "DELETE",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                verification_channel_id: payload.verification_channel_id,
                verification_role_id: payload.verification_role_id,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            return {
                success: false,
                error: errText || "The backend application rejected the verification removal request.",
            };
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
            }
        };

        await saveWelcomeConfig(guildId, updatedConfig);
        revalidatePath(`/dashboard/${guildId}/welcome`);

        return { success: true };
    } catch (error: any) {
        console.error("Error tearing down server verification:", error);
        return {
            success: false,
            error: error.message || "An error occurred while communicating with the backend.",
        };
    }
}