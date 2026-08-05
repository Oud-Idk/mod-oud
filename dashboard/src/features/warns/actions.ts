"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
    saveWarnThresholds,
    deleteWarnThresholds as deleteWarnThresholdsQuery,
    searchWarns,
} from "@/features/warns/queries";
import { SaveWarnThresholdInput } from "@/features/warns/types";


export async function saveWarnThresholdsAction(
    guildId: string,
    thresholds: SaveWarnThresholdInput[]
): Promise<void> {
    try {
        const validGuildId = z.string().parse(guildId);

        await saveWarnThresholds(validGuildId, thresholds);
        revalidatePath(`/guilds/${validGuildId}/warns`);
    } catch (error) {
        console.error("Failed to save warn thresholds:", error);
        if (error instanceof z.ZodError) {
            throw new Error(`Validation Error: ${error.issues.map((i) => i.message).join(", ")}`);
        }
        throw new Error(error instanceof Error ? error.message : "Failed to save warn thresholds.");
    }
}

export async function deleteWarnThresholdsAction(
    guildId: string,
    ids: number[]
): Promise<void> {
    try {
        const validGuildId = z.string().parse(guildId);

        await deleteWarnThresholdsQuery(validGuildId, ids);
        revalidatePath(`/guilds/${validGuildId}/warns`);
    } catch (error) {
        console.error("Failed to delete warn thresholds:", error);
        if (error instanceof z.ZodError) {
            throw new Error(`Validation Error: ${error.issues.map((i) => i.message).join(", ")}`);
        }
        throw new Error(error instanceof Error ? error.message : "Failed to delete warn thresholds.");
    }
}


export async function searchWarnsAction(guildId: string, userId: string) {
    try {
        return await searchWarns(guildId, userId);
    } catch (error) {
        console.error("Failed to search warns:", error);
        return [];
    }
}