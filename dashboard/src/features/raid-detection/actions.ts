"use server";

import { RaidDetectionConfig} from "@/features/raid-detection/types";
import { saveRaidDetectionConfig } from "@/features/raid-detection/queries";
import { revalidatePath } from "next/cache";

import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveRaidDetectionConfigAction(guildId: string, data: RaidDetectionConfig): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        await saveRaidDetectionConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/raid-detection`);
    } catch (error) {
        console.error("Failed to save raid detection config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}