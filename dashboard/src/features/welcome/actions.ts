"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveWelcomeConfig } from "./queries";
import {
    saveWelcomeConfigSchema,
    type WelcomeConfig,
} from "./types";

export async function saveWelcomeConfigAction(
    guildId: string,
    data: WelcomeConfig
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);

        const validatedData = saveWelcomeConfigSchema.parse(data);
        await saveWelcomeConfig(guildId, validatedData);

        revalidatePath(`/dashboard/${guildId}/welcome`);
    } catch (error) {
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        console.error("Failed to save welcome config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}
