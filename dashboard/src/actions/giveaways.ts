"use server";

import { verifyGuildAccess } from "@/actions/config";
import { deleteGiveaway, saveGiveaway, SaveGiveawayData } from "@/utils/db/giveaways";
import { revalidatePath } from "next/cache";

export async function saveGiveawayAction(guildId: string, config: SaveGiveawayData) {
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

export async function deleteGiveawayAction(guildId: string, id: number) {
    await verifyGuildAccess(guildId);
    const ret = await deleteGiveaway(id);
    revalidatePath(`/dashboard/${guildId}/giveaway`);
    return ret;
}

export async function sendGiveawayAction(guildId: string, id: number) {
    await verifyGuildAccess(guildId);
    const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";
    const response = await fetch(`${backendUrl}/api/guilds/${guildId}/giveaways/${id}/send`, { method: "POST" });

    if (!response.ok) {
        throw new Error(await response.text() || "Failed to dispatch giveaway message.");
    }

    revalidatePath(`/dashboard/${guildId}/giveaway`);
    return await response.json();
}

export async function deleteGiveawayDiscordMessageAction(guildId: string, id: number) {
    await verifyGuildAccess(guildId);
    const backendUrl = process.env.BACKEND_INTERNAL_URL || "http://localhost:8080";
    const response = await fetch(`${backendUrl}/api/guilds/${guildId}/giveaways/${id}/message`, { method: "DELETE" });

    if (!response.ok) {
        throw new Error(await response.text() || "Failed to delete Discord message.");
    }

    revalidatePath(`/dashboard/${guildId}/giveaway`);
    return { success: true };
}