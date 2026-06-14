"use server";

import { revalidatePath } from "next/cache";
import { deleteXpMultiplier, deleteXpMultipliers, saveXpMultiplier, saveXpMultipliers } from "@/utils/db/multipliers";
import { verifyGuildAccess } from "@/actions/config";

export async function saveMultiplierAction(
    guildId: string,
    targetId: string,
    targetType: "channel" | "role",
    multiplier: number
) {
    try {
        await verifyGuildAccess(guildId);
        await saveXpMultiplier(guildId, targetId, targetType, multiplier);
        revalidatePath(`/dashboard/${guildId}/leveling`);
    } catch (error) {
        console.error("Failed to save multiplier:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save multiplier.");
    }
}

export async function deleteMultiplierAction(guildId: string, targetId: string) {
    try {
        await verifyGuildAccess(guildId);
        await deleteXpMultiplier(guildId, targetId);
        revalidatePath(`/dashboard/${guildId}/leveling`);
    } catch (error) {
        console.error("Failed to delete multiplier:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete multiplier.");
    }
}

export async function deleteMultipliersAction(guildId: string, targetIds: string[]) {
    try {
        await verifyGuildAccess(guildId);
        await deleteXpMultipliers(guildId, targetIds);
        revalidatePath(`/dashboard/${guildId}/leveling`);
    } catch (error) {
        console.error("Failed to delete multipliers:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete multipliers.");
    }
}

export async function saveMultipliersAction(
    guildId: string,
    targets: Array<{ targetId: string; targetType: "channel" | "role"; multiplier: number }>
) {
    try {
        await verifyGuildAccess(guildId);
        await saveXpMultipliers(guildId, targets);
        revalidatePath(`/dashboard/${guildId}/leveling`);
    } catch (error) {
        console.error("Failed to save multipliers:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save multipliers.");
    }
}