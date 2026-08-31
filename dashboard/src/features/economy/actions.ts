"use server";

import { verifyGuildAccess } from "@/features/_shared/guild";
import { revalidatePath } from "next/cache";
import {
    EconomyConfigInput,
    economyConfigSchema,
    EconomyItem,
    economyItemSchema,
    EconomyCategory,
    economyCategorySchema,
    EconomyWorkMessage,
    economyWorkMessageSchema
} from "@/features/economy/types";
import {
    saveEconomyConfig,
    saveEconomyItem,
    deleteEconomyItem,
    saveEconomyCategory,
    deleteEconomyCategory,
    saveEconomyWorkMessage,
    deleteEconomyWorkMessage,
    syncEconomyWorkMessages
} from "@/features/economy/queries";
import { z } from "zod";

export async function saveEconomyConfigAction(
    guildId: string,
    rawData: EconomyConfigInput
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const validatedData = economyConfigSchema.parse(rawData);
        await saveEconomyConfig(guildId, validatedData);
        revalidatePath(`/dashboard/${guildId}/economy`);
    } catch (error) {
        console.error("Failed to save economy config:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(
            error instanceof Error ? error.message : "Could not save configuration."
        );
    }
}

function getFriendlyEconomyItemError(error: unknown): string | null {
    const message = error instanceof Error ? error.message : "";
    if (
        message.includes("uq_economy_items_guild_name") ||
        message.includes("duplicate key value violates unique constraint")
    ) {
        return "An item with this name already exists. Please choose a different name.";
    }
    return null;
}

export async function saveEconomyItemAction(
    guildId: string,
    rawData: unknown
): Promise<EconomyItem> {
    try {
        await verifyGuildAccess(guildId);
        const validatedItem = economyItemSchema.parse(rawData);
        const savedItem = await saveEconomyItem(guildId, validatedItem);
        revalidatePath(`/dashboard/${guildId}/economy`);
        return savedItem;
    } catch (error) {
        console.error("Failed to save store item:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        const friendly = getFriendlyEconomyItemError(error);
        if (friendly !== null) {
            throw new Error(friendly);
        }
        throw new Error(
            error instanceof Error ? error.message : "Could not save item."
        );
    }
}

export async function deleteEconomyItemAction(
    guildId: string,
    itemId: string
): Promise<boolean> {
    try {
        await verifyGuildAccess(guildId);
        const success = await deleteEconomyItem(guildId, itemId);
        revalidatePath(`/dashboard/${guildId}/economy`);
        return success;
    } catch (error) {
        console.error("Failed to delete store item:", error);
        throw new Error(
            error instanceof Error ? error.message : "Could not delete item."
        );
    }
}

function getFriendlyCategoryError(error: unknown): string | null {
    const message = error instanceof Error ? error.message : "";
    if (
        message.includes("uq_economy_categories_guild_name") ||
        message.includes("duplicate key value violates unique constraint")
    ) {
        return "A category with this name already exists.";
    }
    return null;
}

export async function saveEconomyCategoryAction(
    guildId: string,
    rawData: unknown
): Promise<EconomyCategory> {
    try {
        await verifyGuildAccess(guildId);
        const validated = economyCategorySchema.parse(rawData);
        const saved = await saveEconomyCategory(guildId, validated);
        revalidatePath(`/dashboard/${guildId}/economy`);
        return saved;
    } catch (error) {
        console.error("Failed to save category:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        const friendly = getFriendlyCategoryError(error);
        if (friendly !== null) throw new Error(friendly);
        throw new Error(error instanceof Error ? error.message : "Could not save category.");
    }
}

export async function deleteEconomyCategoryAction(guildId: string, categoryId: string): Promise<boolean> {
    try {
        await verifyGuildAccess(guildId);
        const success = await deleteEconomyCategory(guildId, categoryId);
        revalidatePath(`/dashboard/${guildId}/economy`);
        return success;
    } catch (error) {
        console.error("Failed to delete category:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete category.");
    }
}

export async function saveEconomyWorkMessageAction(
    guildId: string,
    rawData: unknown
): Promise<EconomyWorkMessage> {
    try {
        await verifyGuildAccess(guildId);
        const validated = economyWorkMessageSchema.parse(rawData);
        const saved = await saveEconomyWorkMessage(guildId, validated);
        revalidatePath(`/dashboard/${guildId}/economy`);
        return saved;
    } catch (error) {
        console.error("Failed to save work message:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(error instanceof Error ? error.message : "Could not save work message.");
    }
}

export async function deleteEconomyWorkMessageAction(guildId: string, messageId: string): Promise<boolean> {
    try {
        await verifyGuildAccess(guildId);
        const success = await deleteEconomyWorkMessage(guildId, messageId);
        revalidatePath(`/dashboard/${guildId}/economy`);
        return success;
    } catch (error) {
        console.error("Failed to delete work message:", error);
        throw new Error(error instanceof Error ? error.message : "Could not delete work message.");
    }
}

export async function syncEconomyWorkMessagesAction(
    guildId: string,
    rawData: unknown
): Promise<EconomyWorkMessage[]> {
    try {
        await verifyGuildAccess(guildId);
        const validated = z.array(economyWorkMessageSchema).parse(rawData);
        const synced = await syncEconomyWorkMessages(guildId, validated);
        revalidatePath(`/dashboard/${guildId}/economy`);
        return synced;
    } catch (error) {
        console.error("Failed to sync work messages:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(error instanceof Error ? error.message : "Could not save work messages.");
    }
}

export async function fetchMoreEconomyLeaderboardAction(
    guildId: string,
    currentLowestTotal: number
): Promise<import("./types").EconomyLeaderboardEntry[]> {
    try {
        await verifyGuildAccess(guildId);
        const { fetchMoreEconomyLeaderboard } = await import("./queries");
        return await fetchMoreEconomyLeaderboard(guildId, currentLowestTotal);
    } catch (error) {
        console.error("Failed to fetch economy leaderboard:", error);
        throw new Error("Could not fetch leaderboard.");
    }
}