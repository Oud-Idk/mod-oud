"use server";

import { z } from "zod";
import { verifyGuildAccess } from "@/features/_shared/guild";
import {
    GuildIdSchema,
    SendEmbedPayload,
    SendEmbedPayloadSchema,
    SendEmbedResponse,
} from "./types";

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

        const response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                channel_id: validPayload.channelId,
                content: null,
                embed: validPayload.embedState,
                format: "EMBED",
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(errText || "Backend returned an error state.");
        }

        const data = await response.json();

        return {
            messageId: data.message_id,
        };
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0]?.message || "Validation failed.");
        }

        throw new Error(
            error instanceof Error ? error.message : "Failed to communicate with the backend server."
        );
    }
}