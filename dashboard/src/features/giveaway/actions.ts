"use server";

import { deleteGiveaway, saveGiveaway } from "@/features/giveaway/queries";
import { revalidatePath } from "next/cache";
import {
    Giveaway,
    SaveGiveawayData,
    sendGiveawayInputSchema, SendGiveawayResponse,
    sendGiveawayResponseSchema
} from "@/features/giveaway/types";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveGiveawayAction(guildId: string, config: SaveGiveawayData): Promise<Giveaway> {
    await verifyGuildAccess(guildId);
    const ret = await saveGiveaway(config);

    if (ret && ret.message_id) {
        try {
            const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";
            await fetch(`${backendUrl}/api/guilds/${guildId}/giveaways/${ret.id}/edit`, { method: "POST" });
        } catch (err) {
            console.error("Failed to auto-update Discord message on save:", err);
        }
    }

    revalidatePath(`/dashboard/${guildId}/giveaway`);
    return ret;
}

export async function deleteGiveawayAction(guildId: string, id: number): Promise<boolean> {
    await verifyGuildAccess(guildId);
    const ret = await deleteGiveaway(id);
    revalidatePath(`/dashboard/${guildId}/giveaway`);
    return ret;
}


export async function sendGiveawayAction(guildId: string, id: number): Promise<SendGiveawayResponse> {
    const validatedInput = sendGiveawayInputSchema.parse({ guildId, id });

    await verifyGuildAccess(validatedInput.guildId);

    const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";
    const response = await fetch(
        `${backendUrl}/api/guilds/${validatedInput.guildId}/giveaways/${validatedInput.id}/send`,
        { method: "POST" }
    );

    if (!response.ok) {
        throw new Error((await response.text()) || "Failed to dispatch giveaway message.");
    }

    const data = await response.json();
    const validatedResponse = sendGiveawayResponseSchema.parse(data);
    revalidatePath(`/dashboard/${validatedInput.guildId}/giveaway`);
    return validatedResponse;
}

export async function deleteGiveawayDiscordMessageAction(guildId: string, id: number): Promise<void> {
    await verifyGuildAccess(guildId);
    const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";
    const response = await fetch(`${backendUrl}/api/guilds/${guildId}/giveaways/${id}/message`, { method: "DELETE" });

    if (!response.ok) {
        throw new Error(await response.text() || "Failed to delete Discord message.");
    }

    revalidatePath(`/dashboard/${guildId}/giveaway`);
}