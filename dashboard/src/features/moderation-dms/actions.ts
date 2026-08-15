"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { saveModerationDMsConfig } from "@/features/moderation-dms/queries";
import { ModerationDMsConfig, moderationDMsConfigSchema } from "@/features/moderation-dms/types";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveModerationDMsConfigAction(guildId: string, data: ModerationDMsConfig): Promise<void> {
    await verifyGuildAccess(guildId);

    try {
        const validConfig = moderationDMsConfigSchema.parse(data);
        await saveModerationDMsConfig(guildId, validConfig);
        revalidatePath(`/dashboard/${guildId}/moderation-dms`);
    } catch (error) {
        console.error("Failed to save moderation DMs config:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}