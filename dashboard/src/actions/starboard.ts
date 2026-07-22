"use server";

import { deleteStarboardConfig, upsertStarboardConfig } from "@/utils/db/starboard";
import { revalidatePath } from "next/cache";
import { verifyGuildAccess } from "@/actions/config";
import { StarboardConfigInput } from "@/types/db/starboard";

export async function saveStarboardConfigAction(guildId: string, data: StarboardConfigInput) {
    try {
        await verifyGuildAccess(guildId);
        await upsertStarboardConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/starboard`);
    } catch (error) {
        console.error("Failed to save starboard config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function deleteStarboardConfigAction(guildId: string, starboardId: string) {
    try {
        await verifyGuildAccess(guildId);
        await deleteStarboardConfig(starboardId, guildId);
        revalidatePath(`/dashboard/${guildId}/starboard`);
    } catch (error) {
        console.error("Failed to delete starboard config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete configuration.");
    }
}