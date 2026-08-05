"use server";

import { revalidatePath } from "next/cache";
import {
    deleteBadWordRuleset,
    saveBadWordRuleset,
    saveMessageFilteringConfig
} from "@/features/message-filtering/queries";
import { BadWordRuleset, MessageFilteringConfig } from "@/features/message-filtering/types";
import { verifyGuildAccess } from "@/features/_shared/guild";


export async function saveMessageFilteringConfigAction(guildId: string, data: MessageFilteringConfig) {
    try {
        await verifyGuildAccess(guildId);
        await saveMessageFilteringConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/message-filtering`);
    } catch (error) {
        console.error("Failed to save message filtering config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function saveBadWordRulesetAction(
    guildId: string,
    ruleset: Omit<BadWordRuleset, 'created_at' | 'updated_at' | 'guild_id' | 'id'> & { id?: string }
): Promise<BadWordRuleset> {
    try {
        const savedRow = await saveBadWordRuleset(guildId, ruleset);
        revalidatePath(`/dashboard/${guildId}/message-filtering`);

        return savedRow;
    } catch (error) {
        console.error(`Failed to save bad word ruleset for guild ${guildId}:`, error);
        throw new Error("Could not save ruleset settings. Please try again.");
    }
}

export async function deleteBadWordRulesetAction(
    guildId: string,
    id: string
): Promise<void> {
    try {
        await deleteBadWordRuleset(guildId, id);
        revalidatePath(`/dashboard/${guildId}/message-filtering`);
    } catch (error) {
        console.error(`Failed to delete bad word ruleset ${id} for guild ${guildId}:`, error);
        throw new Error("Could not delete ruleset. Please try again.");
    }
}

