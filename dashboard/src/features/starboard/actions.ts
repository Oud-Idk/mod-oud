"use server";

import { revalidatePath } from "next/cache";
import { deleteStarboardConfig, upsertStarboardConfig } from "@/features/starboard/queries";
import { StarboardConfigInput } from "@/features/starboard/types";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveStarboardConfigAction(guildId: string, data: StarboardConfigInput): Promise<string> {
    try {
        await verifyGuildAccess(guildId);
        const s = await upsertStarboardConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/starboard`);
        return s.id;
    } catch (error) {
        console.error("Failed to save starboard config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function deleteStarboardConfigAction(guildId: string, starboardId: string): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        await deleteStarboardConfig(starboardId, guildId);
        revalidatePath(`/dashboard/${guildId}/starboard`);
    } catch (error) {
        console.error("Failed to delete starboard config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete configuration.");
    }
}