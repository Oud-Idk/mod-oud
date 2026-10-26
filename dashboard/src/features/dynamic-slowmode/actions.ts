"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveDynamicSlowmodeConfig } from "./queries";
import {
    saveDynamicSlowmodeConfigSchema,
    type DynamicSlowmodeConfig,
} from "./types";

export async function saveDynamicSlowmodeConfigAction(
    guildId: string,
    data: DynamicSlowmodeConfig
): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const validConfig = saveDynamicSlowmodeConfigSchema.parse(data);
        await saveDynamicSlowmodeConfig(guildId, validConfig);
        revalidatePath(`/dashboard/${guildId}/dynamic-slowmode`);
    } catch (error) {
        console.error("Failed to save dynamic slowmode config:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}
