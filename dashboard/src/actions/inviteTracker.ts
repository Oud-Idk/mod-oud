"use server";

import { revalidatePath } from "next/cache";
import { verifyGuildAccess } from "@/actions/config";
import { InviteTrackerConfig, saveInviteTrackerConfig } from "@/utils/db/config";

export async function saveInviteTrackerConfigAction(guildId: string, data: InviteTrackerConfig) {
    try {
        await verifyGuildAccess(guildId);
        await saveInviteTrackerConfig(guildId, data);
        revalidatePath(`/dashboard/${guildId}/invite-tracker`);
    } catch (error) {
        console.error("Failed to save invite tracker config:", error);
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}