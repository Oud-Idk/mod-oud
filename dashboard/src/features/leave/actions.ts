"use server";

import { LeaveConfig } from "@/features/leave/types";
import { saveLeaveConfig } from "@/features/leave/queries";
import { revalidatePath } from "next/cache";

import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveLeaveConfigAction(guildId: string, data: LeaveConfig): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        await saveLeaveConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/leave`);
    } catch (error) {
        console.error("Failed to save leave config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}