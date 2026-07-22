"use server";

import { verifyGuildAccess } from "@/actions/config";

export interface SendEmbedPayload {
    channelId: string;
    embedState: object;
}

export interface SendEmbedResponse {
    success: boolean;
    messageId?: string;
    error?: string;
}

async function sendMessage(endpoint: string, payload: SendEmbedPayload) {
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            channel_id: payload.channelId,
            content: null,
            embed: payload.embedState,
            format: "EMBED",
        }),
    });

    if (!response.ok) {
        const errText = await response.text();
        return {
            success: false,
            error: errText || "Backend returned an error state.",
        };
    }

    const data = await response.json();
    return {
        success: true,
        messageId: data.message_id,
    };
}

export async function sendEmbedAction(
    guildId: string,
    payload: SendEmbedPayload
): Promise<SendEmbedResponse> {
    try {
        await verifyGuildAccess(guildId);
        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";
        const endpoint = `${backendUrl}/api/guilds/${guildId}/embeds/send`
        return await sendMessage(endpoint, payload);
    } catch (error: any) {
        return {
            success: false,
            error: error.message || "Failed to communicate with the backend server.",
        };
    }
}


export async function sendInterfaceMessageAction(
    guildId: string,
    payload: SendEmbedPayload
): Promise<SendEmbedResponse> {
    try {
        await verifyGuildAccess(guildId);
        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";
        const endpoint = `${backendUrl}/api/guilds/${guildId}/temp-voice/interface/setup`;
        return await sendMessage(endpoint, payload);
    } catch (error: any) {
        return {
            success: false,
            error: error.message || "Failed to communicate with the backend server.",
        };
    }
}