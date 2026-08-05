"use server";

import { revalidatePath } from "next/cache";
import { saveModerationDMsConfig } from "@/features/moderation-dms/queries";
import { ModerationDMsConfig } from "@/features/moderation-dms/types";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveModerationDMsConfigAction(guildId: string, data: ModerationDMsConfig): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        await saveModerationDMsConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/moderation-dms`);
    } catch (error) {
        console.error("Failed to save moderation_old DMs config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}