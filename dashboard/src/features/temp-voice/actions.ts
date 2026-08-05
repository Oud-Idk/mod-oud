"use server";

import { z } from "zod";
import { invalidateGuildChannelCache } from "@/features/_shared/channels";
import { revalidatePath } from "next/cache";
import { deleteTempVoiceHub, saveTempVoiceHub } from "@/features/temp-voice/queries";
import { SaveTempVoiceHubInput, saveTempVoiceHubInputSchema, TempVoiceHub } from "@/features/temp-voice/types";
import { sendMessage } from "@/features/embed-builder/actions";
import {
    GuildIdSchema,
    SendEmbedPayload,
    SendEmbedPayloadSchema,
    SendEmbedResponse
} from "@/features/embed-builder/types";
import { verifyGuildAccess } from "@/features/_shared/guild";

const guildIdSchema = z.string().min(1, "Guild ID is required");

export async function saveTempVoiceHubAction(
    guildId: string,
    hub: SaveTempVoiceHubInput
): Promise<TempVoiceHub> {
    try {
        const validGuildId = guildIdSchema.parse(guildId);
        const validHub = saveTempVoiceHubInputSchema.parse(hub);

        await verifyGuildAccess(validGuildId);

        const saved = await saveTempVoiceHub(validGuildId, validHub);
        revalidatePath(`/dashboard/${validGuildId}/temp-voice`);
        return saved;
    } catch (error) {
        console.error("Failed to save temporary voice hub:", error);

        if (error instanceof z.ZodError) {
            throw new Error(`Validation Error: ${error.issues.map(e => e.message).join(", ")}`);
        }

        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function deleteTempVoiceHubAction(guildId: string, hubId: string): Promise<void> {
    try {
        const validGuildId = guildIdSchema.parse(guildId);
        const validHubId = z.uuid("Invalid Hub ID format").parse(hubId);

        await verifyGuildAccess(validGuildId);
        await deleteTempVoiceHub(validGuildId, validHubId);

        revalidatePath(`/dashboard/${validGuildId}/temp-voice`);
    } catch (error) {
        console.error("Failed to delete temporary voice hub:", error);

        if (error instanceof z.ZodError) {
            throw new Error(`Validation Error: ${error.issues.map(e => e.message).join(", ")}`);
        }

        throw new Error(error instanceof Error ? error.message : "Could not delete configuration.");
    }
}

const setupTempVoicePayloadSchema = z.object({
    categoryName: z.string().min(1, "Category name cannot be empty").max(100),
    hubChannelName: z.string().min(1, "Hub channel name cannot be empty").max(100),
});

type SetupTempVoicePayload = z.infer<typeof setupTempVoicePayloadSchema>;

const backendSetupResponseSchema = z.object({
    category_id: z.string(),
    hub_channel_id: z.string(),
    interface_channel_id: z.string().nullish(),
});

export interface SetupTempVoiceResponse {
    success: boolean;
    categoryId?: string;
    interfaceChannelId?: string;
    hubChannelId?: string;
    error?: string;
}

export async function setupTempVoiceAction(
    guildId: string,
    payload: SetupTempVoicePayload
): Promise<SetupTempVoiceResponse> {
    try {
        const validGuildId = guildIdSchema.parse(guildId);
        const validPayload = setupTempVoicePayloadSchema.parse(payload);

        await verifyGuildAccess(validGuildId);

        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";

        const response = await fetch(`${backendUrl}/api/guilds/${validGuildId}/temp-voice/setup`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                category_name: validPayload.categoryName,
                hub_channel_name: validPayload.hubChannelName,
                user_limit: null,
            }),
        });

        if (!response.ok) {
            const errText = await response.text();
            return {
                success: false,
                error: errText || "The backend rejected the channel setup.",
            };
        }

        const rawData = await response.json();

        const data = backendSetupResponseSchema.parse(rawData);

        await invalidateGuildChannelCache(validGuildId);

        return {
            success: true,
            categoryId: data.category_id,
            hubChannelId: data.hub_channel_id,
            interfaceChannelId: data.interface_channel_id ?? undefined,
        };
    } catch (error) {
        if (error instanceof z.ZodError) {
            return {
                success: false,
                error: error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join(", "),
            };
        }

        const err = error instanceof Error ? error.message : "Could not setup temp voice hub:";

        return {
            success: false,
            error: err,
        };
    }
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

export async function sendInterfaceMessageAction(
    guildId: string,
    payload: SendEmbedPayload
): Promise<SendEmbedResponse> {
    try {
        const validGuildId = GuildIdSchema.parse(guildId);
        const validPayload = SendEmbedPayloadSchema.parse(payload);

        await verifyGuildAccess(validGuildId);
        const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";
        const endpoint = `${backendUrl}/api/guilds/${validGuildId}/temp-voice/interface/setup`;
        return await sendMessage(endpoint, validPayload);
    } catch (error: unknown) {
        return {
            success: false,
            error: formatError(error),
        };
    }
}