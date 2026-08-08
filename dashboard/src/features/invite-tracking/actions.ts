"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
    InviteTrackerConfig,
    LeaderboardEntry,
    inviteTrackerConfigSchema
} from "@/features/invite-tracking/types";
import { getInviteLeaderboard, saveInviteTrackerConfig } from "@/features/invite-tracking/queries";
import { verifyGuildAccess } from "@/features/_shared/guild";

export async function saveInviteTrackerConfigAction(guildId: string, data: InviteTrackerConfig): Promise<void> {
    try {
        await verifyGuildAccess(guildId);
        const validConfig = inviteTrackerConfigSchema.parse(data);
        await saveInviteTrackerConfig(guildId, validConfig);
        revalidatePath(`/dashboard/${guildId}/invite-tracker`);
    } catch (error) {
        console.error("Failed to save invite tracker config:", error);
        if (error instanceof z.ZodError) {
            throw new Error(error.issues[0]?.message || "Validation Error");
        }
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function fetchInviteLeaderboardAction(
    guildId: string,
    offset: number,
    limit = 15
): Promise<LeaderboardEntry[]> {
    // 1. Access control ALWAYS comes first
    await verifyGuildAccess(guildId);

    const validOffset = z.number().int().nonnegative().parse(offset);
    const validLimit = z.number().int().positive().parse(limit);

    return getInviteLeaderboard(guildId, validLimit, validOffset);
}