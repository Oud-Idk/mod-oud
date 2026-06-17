"use server";

import { revalidatePath } from "next/cache";
import { deleteLevelRewards, deleteXpMultipliers, saveLevelRewards, saveXpMultipliers } from "@/utils/db/leveling";
import { verifyGuildAccess } from "@/actions/config";

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

export async function saveRewardsAction(
    guildId: string,
    rewards: Array<{ levelRequirement: number; rolesToAdd: string[]; removePreviousRoles: boolean }>
) {
    try {
        await verifyGuildAccess(guildId);
        await saveLevelRewards(guildId, rewards);
        revalidatePath(`/dashboard/${guildId}/leveling`);
    } catch (error) {
        console.error("Failed to save rewards:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save rewards.");
    }
}

export async function deleteRewardsAction(
    guildId: string,
    ids: number[],
) {
    try {
        await verifyGuildAccess(guildId);
        await deleteLevelRewards(guildId, ids);
        revalidatePath(`/dashboard/${guildId}/leveling`);
    } catch (error) {
        console.error("Failed to delete rewards:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete rewards.");
    }
}