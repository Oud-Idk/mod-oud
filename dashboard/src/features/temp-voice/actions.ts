"use server";

import { backendFetch } from "@/lib/backend";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { invalidateGuildChannelCache } from "@/features/_shared/channels";
import { verifyGuildAccess } from "@/features/_shared/guild";
import {
    GuildIdSchema,
    SendEmbedPayloadSchema,
    type SendEmbedPayload,
    type SendEmbedResponse,
} from "@/features/embed-builder/types";
import { deleteTempVoiceHub, saveTempVoiceHub } from "./queries";
import {
    backendSetupResponseSchema,
    saveTempVoiceHubInputSchema,
    setupTempVoicePayloadSchema,
    type SaveTempVoiceHubInput,
    type SetupTempVoicePayload,
    type SetupTempVoiceResponse,
    type TempVoiceHub,
} from "./types";

const interfaceMessageResponseSchema = z.object({
    message_id: z.string(),
});

export async function saveTempVoiceHubAction(
    guildId: string,
    hub: SaveTempVoiceHubInput
): Promise<TempVoiceHub> {
    try {
        await verifyGuildAccess(guildId);

        const validHub = saveTempVoiceHubInputSchema.parse(hub);
        const saved = await saveTempVoiceHub(guildId, validHub);

        revalidatePath(`/dashboard/${guildId}/temp-voice`);
        return saved;
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        console.error("Failed to save temporary voice hub:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function deleteTempVoiceHubAction(guildId: string, hubId: string): Promise<void> {
    try {
        await verifyGuildAccess(guildId);

        await deleteTempVoiceHub(guildId, hubId);
        revalidatePath(`/dashboard/${guildId}/temp-voice`);
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        console.error("Failed to delete temporary voice hub:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete configuration.");
    }
}

export async function setupTempVoiceAction(
    guildId: string,
    payload: SetupTempVoicePayload
): Promise<SetupTempVoiceResponse> {
    try {
        await verifyGuildAccess(guildId);
        const validPayload = setupTempVoicePayloadSchema.parse(payload);
        const response = await backendFetch(`/api/guilds/${guildId}/temp-voice/setup`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                category_name: validPayload.categoryName,
                hub_channel_name: validPayload.hubChannelName,
                user_limit: null,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(
                errText !== "" ? errText : "The backend rejected the channel setup."
            );
        }

        const rawData: unknown = await response.json();
        const data = backendSetupResponseSchema.parse(rawData);

        await invalidateGuildChannelCache(guildId);

        return {
            categoryId: data.category_id,
            hubChannelId: data.hub_channel_id,
            interfaceChannelId: data.interface_channel_id ?? undefined,
        };
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        console.error("Failed to setup temporary voice hub:", error);
        throw new Error(error instanceof Error ? error.message : "Could not setup temp voice hub.");
    }
}

export async function sendInterfaceMessageAction(
    guildId: string,
    payload: SendEmbedPayload
): Promise<SendEmbedResponse> {
    try {
        const validGuildId = GuildIdSchema.parse(guildId);
        const validPayload = SendEmbedPayloadSchema.parse(payload);

        await verifyGuildAccess(validGuildId);

        const response = await backendFetch(`/api/guilds/${validGuildId}/temp-voice/interface/setup`, {
            method: "POST",
            body: JSON.stringify({
                channelId: validPayload.channelId,
                embedState: validPayload.embedState,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(
                errText !== "" ? errText : "Backend returned an error state."
            );
        }

        const rawData: unknown = await response.json();
        const data = interfaceMessageResponseSchema.parse(rawData);

        return {
            messageId: data.message_id,
        };
    } catch (error: unknown) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        console.error("Failed to send interface message:", error);
        throw new Error(error instanceof Error ? error.message : "Failed to communicate with backend server.");
    }
}