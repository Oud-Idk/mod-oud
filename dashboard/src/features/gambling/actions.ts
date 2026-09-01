"use server";

import { verifyGuildAccess } from "@/features/_shared/guild";
import { revalidatePath } from "next/cache";
import { gamblingConfigSchema, GamblingConfigInput } from "@/features/gambling/types";
import { saveGamblingConfig } from "@/features/gambling/queries";
import { z } from "zod";

export async function saveGamblingConfigAction(
    guildId: string,
    rawData: GamblingConfigInput
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const validated = gamblingConfigSchema.parse(rawData);
        await saveGamblingConfig(guildId, validated);
        revalidatePath(`/dashboard/${guildId}/gambling`);
    } catch (error) {
        console.error("Failed to save gambling config:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(error instanceof Error ? error.message : "Could not save gambling configuration.");
    }
}
