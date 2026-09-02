"use server";

import { backendFetch } from "@/lib/backend";
import { z } from "zod";
import { verifyGuildAccess } from "@/features/_shared/guild";
import {
    GuildIdSchema,
    SendEmbedPayload,
    SendEmbedPayloadSchema,
    SendEmbedResponse,
} from "./types";

const sendEmbedResponseSchema = z.object({
    message_id: z.string(),
});

export async function sendEmbedAction(
    guildId: string,
    payload: SendEmbedPayload
): Promise<SendEmbedResponse> {
    try {
        const validGuildId = GuildIdSchema.parse(guildId);
        const validPayload = SendEmbedPayloadSchema.parse(payload);

        await verifyGuildAccess(validGuildId);

        const response = await backendFetch(`/api/guilds/${validGuildId}/embeds/send`, {
            method: "POST",
            body: JSON.stringify({
                channel_id: validPayload.channelId,
                content: null,
                embed: validPayload.embedState,
                format: "EMBED",
            }),
        });

        if (!response.ok) {
            const errText = (await response.text()).trim();
            throw new Error(errText !== "" ? errText : "Backend returned an error state.");
        }

        const data = sendEmbedResponseSchema.parse(await response.json());

        return {
            messageId: data.message_id,
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }

        throw new Error(
            error instanceof Error ? error.message : "Failed to communicate with the backend server."
        );
    }
}