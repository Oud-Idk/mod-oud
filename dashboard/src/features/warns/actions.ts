"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyGuildAccess } from "@/features/_shared/guild";
import {
    deleteWarnThresholds,
    getWarnThresholds,
    saveWarnThresholds,
    searchWarns,
} from "./queries";
import {
    saveWarnThresholdsInputSchema,
    type SaveWarnThresholdInput,
    type Warn,
    type WarnThreshold,
} from "./types";

export async function getWarnThresholdsAction(guildId: string): Promise<WarnThreshold[]> {
    try {
        await verifyGuildAccess(guildId);
        return await getWarnThresholds(guildId);
    } catch (error) {
        console.error("Failed to fetch warn thresholds:", error);
        return [];
    }
}

export async function saveWarnThresholdsAction(
    guildId: string,
    thresholds: SaveWarnThresholdInput[]
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);

        const validThresholds = saveWarnThresholdsInputSchema.parse(thresholds);
        await saveWarnThresholds(guildId, validThresholds);

        revalidatePath(`/dashboard/${guildId}/warns`);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0]?.message || "Invalid warn thresholds configuration.");
        }
        console.error("Failed to save warn thresholds:", error);
        throw new Error(error instanceof Error ? error.message : "Failed to save warn thresholds.");
    }
}

export async function deleteWarnThresholdsAction(
    guildId: string,
    ids: number[]
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);

        await deleteWarnThresholds(guildId, ids);
        revalidatePath(`/dashboard/${guildId}/warns`);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0]?.message || "Invalid IDs specified.");
        }
        console.error("Failed to delete warn thresholds:", error);
        throw new Error(error instanceof Error ? error.message : "Failed to delete warn thresholds.");
    }
}

export async function searchWarnsAction(guildId: string, userId: string): Promise<Warn[]> {
    try {
        await verifyGuildAccess(guildId);
        return await searchWarns(guildId, userId);
    } catch (error) {
        console.error("Failed to search warns:", error);
        return [];
    }
}