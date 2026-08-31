"use server";

import { verifyGuildAccess } from "@/features/_shared/guild";
import { revalidatePath } from "next/cache";
import {
    EconomyConfigInput,
    economyConfigSchema,
    EconomyItem,
    economyItemSchema
} from "@/features/economy/types";
import {
    saveEconomyConfig,
    saveEconomyItem,
    deleteEconomyItem
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