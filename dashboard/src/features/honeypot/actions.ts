"use server";

import { revalidatePath } from "next/cache";
import { saveHoneypotConfig, setupHoneypot, SetupHoneypotResult } from "./queries";
import { type HoneypotConfigInput, honeypotConfigSchema } from "./types";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function setupHoneypotAction(
    guildId: string,
    channelName: string
): Promise<SetupHoneypotResult> {
    try {
        await verifyGuildAccess(guildId);
        const { channelId } = await setupHoneypot(guildId, channelName);
        revalidatePath(`/dashboard/${guildId}/honeypot`);
        return { success: true, channelId };
    } catch (error) {
        console.error("Honeypot setup error:", error);
        return {
            success: false,
            error: error instanceof Error ? error.message : "An unknown error occurred",
        };
    }
}
export async function saveHoneypotConfigAction(
    guildId: string,
    rawData: HoneypotConfigInput
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const validatedData = honeypotConfigSchema.parse(rawData);
        await saveHoneypotConfig(guildId, validatedData);
        revalidatePath(`/dashboard/${guildId}/honeypot`);
    } catch (error) {
        console.error("Failed to save honeypot config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}