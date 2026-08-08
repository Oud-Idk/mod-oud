"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { raidDetectionConfigSchema, RaidDetectionConfig } from "@/features/raid-detection/types";
import { saveRaidDetectionConfig } from "@/features/raid-detection/queries";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveRaidDetectionConfigAction(guildId: string, data: RaidDetectionConfig): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const validConfig = raidDetectionConfigSchema.parse(data);
        await saveRaidDetectionConfig(guildId, validConfig);
        revalidatePath(`/dashboard/${guildId}/raid-detection`);
    } catch (error) {
        console.error("Failed to save raid detection config:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0]?.message || "Validation Error");
        }
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}