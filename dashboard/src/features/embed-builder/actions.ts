"use server";

import { z } from "zod";
import {
    GuildIdSchema,
    SendEmbedPayload,
    SendEmbedPayloadSchema,
    SendEmbedResponse
} from "@/features/embed-builder/types";
import { verifyGuildAccess } from "@/features/_shared/guild";

export type SendMessageResponseType = { success: true; messageId: string } | { success: false; error: string };

export async function sendMessage(endpoint: string, payload: SendEmbedPayload): Promise<SendMessageResponseType> {
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

function formatError(error: unknown): string {
    if (error instanceof z.ZodError) {
        return error.issues.map((issue) => issue.message).join(", ");
    }
    if (error instanceof Error) {
        return error.message;
    }
    return "Failed to communicate with the backend server.";
}

export async function sendEmbedAction(
    guildId: string,
    payload: SendEmbedPayload
): Promise<SendEmbedResponse> {
    try {
        const validGuildId = GuildIdSchema.parse(guildId);
        const validPayload = SendEmbedPayloadSchema.parse(payload);

        await verifyGuildAccess(validGuildId);
        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";
        const endpoint = `${backendUrl}/api/guilds/${validGuildId}/embeds/send`;
        return await sendMessage(endpoint, validPayload);
    } catch (error: unknown) {
        return {
            success: false,
            error: formatError(error),
        };
    }
}
