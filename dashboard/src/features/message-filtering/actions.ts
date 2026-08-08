"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
    deleteBadWordRuleset,
    saveBadWordRuleset,
    saveMessageFilteringConfig
} from "@/features/message-filtering/queries";
import {
    BadWordRuleset,
    MessageFilteringConfig,
    SaveableBadWordRuleset,
    messageFilteringConfigSchema,
    saveBadWordRulesetInputSchema
} from "@/features/message-filtering/types";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveMessageFilteringConfigAction(
    guildId: string,
    data: MessageFilteringConfig
): Promise<void> {

    try {
        await verifyGuildAccess(guildId);
        const validConfig = messageFilteringConfigSchema.parse(data);
        await saveMessageFilteringConfig(guildId, validConfig);
        revalidatePath(`/dashboard/${guildId}/message-filtering`);
    } catch (error) {
        console.error("Failed to save message filtering config:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0]?.message || "Validation Error");
        }
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function saveBadWordRulesetAction(
    guildId: string,
    ruleset: SaveableBadWordRuleset
): Promise<BadWordRuleset> {
    try {
        await verifyGuildAccess(guildId);
        const validRuleset = saveBadWordRulesetInputSchema.parse(ruleset);
        const savedRow = await saveBadWordRuleset(guildId, validRuleset);
        revalidatePath(`/dashboard/${guildId}/message-filtering`);

        return savedRow;
    } catch (error) {
        console.error(`Failed to save bad word ruleset for guild ${guildId}:`, error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0]?.message || "Validation Error");
        }
        throw new Error("Could not save ruleset settings. Please try again.");
    }
}

export async function deleteBadWordRulesetAction(
    guildId: string,
    id: string
): Promise<void> {

    try {
        await verifyGuildAccess(guildId);
        const validId = z.string().min(1).parse(id);
        await deleteBadWordRuleset(guildId, validId);
        revalidatePath(`/dashboard/${guildId}/message-filtering`);
    } catch (error) {
        console.error(`Failed to delete bad word ruleset ${id} for guild ${guildId}:`, error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0]?.message || "Validation Error");
        }
        throw new Error("Could not delete ruleset. Please try again.");
    }
}