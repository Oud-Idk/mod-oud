"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { deleteStarboardConfig, upsertStarboardConfig } from "./queries";
import { starboardConfigInputSchema, type StarboardConfigInput } from "./types";

export async function saveStarboardConfigAction(guildId: string, data: StarboardConfigInput): Promise<string> {
    try {
        await verifyGuildAccess(guildId);

        const validatedInput = starboardConfigInputSchema.parse(data);
        const s = await upsertStarboardConfig(guildId, validatedInput);

        revalidatePath(`/dashboard/${guildId}/starboard`);
        return s.id;
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0]?.message || "Validation Error");
        }
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