"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
    deleteLevelRewards,
    deleteXpMultipliers,
    fetchMoreLevels,
    saveLevelingConfig,
    saveLevelRewards,
    saveXpMultipliers
} from "@/features/leveling/queries";
import {
    LevelingConfig,
    SaveLevelRewardInput,
    SaveXpMultiplierInput,
    saveLevelRewardInputSchema,
    saveXpMultiplierInputSchema,
    saveLevelingConfigSchema
} from "@/features/leveling/types";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function deleteMultipliersAction(
    guildId: string,
    targetIds: string[]
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const validIds = z.array(z.string()).parse(targetIds);
        await deleteXpMultipliers(guildId, validIds);
        revalidatePath(`/dashboard/${guildId}/leveling`);
    } catch (error: unknown) {
        console.error("Failed to delete multipliers:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(error instanceof Error ? error.message : "Could not delete multipliers.");
    }
}

export async function saveMultipliersAction(
    guildId: string,
    targets: SaveXpMultiplierInput[]
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const validTargets = z.array(saveXpMultiplierInputSchema).parse(targets);
        await saveXpMultipliers(guildId, validTargets);
        revalidatePath(`/dashboard/${guildId}/leveling`);
    } catch (error: unknown) {
        console.error("Failed to save multipliers:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(error instanceof Error ? error.message : "Could not save multipliers.");
    }
}

export async function saveRewardsAction(
    guildId: string,
    rewards: SaveLevelRewardInput[]
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const validRewards = z.array(saveLevelRewardInputSchema).parse(rewards);
        await saveLevelRewards(guildId, validRewards);
        revalidatePath(`/dashboard/${guildId}/leveling`);
    } catch (error: unknown) {
        console.error("Failed to save rewards:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(error instanceof Error ? error.message : "Could not save rewards.");
    }
}

export async function deleteRewardsAction(
    guildId: string,
    ids: number[]
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const validIds = z.array(z.number().int()).parse(ids);
        await deleteLevelRewards(guildId, validIds);
        revalidatePath(`/dashboard/${guildId}/leveling`);
    } catch (error: unknown) {
        console.error("Failed to delete rewards:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(error instanceof Error ? error.message : "Could not delete rewards.");
    }
}

export async function fetchMoreLevelsAction(
    guildId: string,
    currentLowestXp: number
): ReturnType<typeof fetchMoreLevels> {
    try {
        await verifyGuildAccess(guildId);
        const validXp = z.number().parse(currentLowestXp);
        return await fetchMoreLevels(guildId, validXp);
    } catch (error: unknown) {
        console.error("Failed to fetch levels:", error);
        throw new Error("Could not fetch levels.");
    }
}

export async function saveLevelingConfigAction(
    guildId: string,
    data: LevelingConfig
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const validConfig = saveLevelingConfigSchema.parse(data);
        await saveLevelingConfig(guildId, validConfig);
        revalidatePath(`/dashboard/${guildId}/leveling`);
    } catch (error: unknown) {
        console.error("Failed to save leveling config:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}