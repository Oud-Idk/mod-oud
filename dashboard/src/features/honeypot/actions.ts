"use server";

import { revalidatePath } from "next/cache";
import { saveHoneypotConfig, setupHoneypot } from "./queries";
import { type HoneypotConfigInput, honeypotConfigSchema } from "./types";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { z } from "zod";

export interface SetupHoneypotResult {
    channelId: string;
}

export async function setupHoneypotAction(
    guildId: string,
    channelName: string
): Promise<SetupHoneypotResult> {
    try {
        await verifyGuildAccess(guildId);
        const { channelId } = await setupHoneypot(guildId, channelName);
        revalidatePath(`/dashboard/${guildId}/honeypot`);
        return { channelId };
    } catch (error) {
        console.error("Honeypot setup error:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(
            error instanceof Error ? error.message : "Failed to set up honeypot channel."
        );
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
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(
            error instanceof Error ? error.message : "Could not save configuration."
        );
    }
}