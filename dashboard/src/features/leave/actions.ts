"use server";

import { z } from "zod";
import { LeaveConfig, saveLeaveConfigSchema } from "@/features/leave/types";
import { saveLeaveConfig } from "@/features/leave/queries";
import { revalidatePath } from "next/cache";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveLeaveConfigAction(guildId: string, data: LeaveConfig): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const validConfig = saveLeaveConfigSchema.parse(data);
        await saveLeaveConfig(guildId, validConfig);
        revalidatePath(`/dashboard/${guildId}/leave`);
    } catch (error) {
        console.error("Failed to save leave config:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0].message);
        }
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}