"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import {
    InviteTrackerConfig,
    LeaderboardEntry,
    inviteTrackerConfigSchema
} from "@/features/invite-tracking/types";
import { getInviteLeaderboard } from "@/features/invite-tracking/queries";
import { saveGuildConfigField, verifyGuildAccess } from "@/features/_shared/guild";

export async function saveInviteTrackerConfig(guildId: string, config: InviteTrackerConfig): Promise<void> {
    const validConfig = inviteTrackerConfigSchema.parse(config);
    await saveGuildConfigField(guildId, "invite_tracker", validConfig);
}

export async function saveInviteTrackerConfigAction(guildId: string, data: InviteTrackerConfig): Promise<void> {
    try {
        const validGuildId = z.string().parse(guildId);
        const validConfig = inviteTrackerConfigSchema.parse(data);

        await verifyGuildAccess(validGuildId);
        await saveInviteTrackerConfig(validGuildId, validConfig);
        revalidatePath(`/dashboard/${validGuildId}/invite-tracker`);
    } catch (error) {
        console.error("Failed to save invite tracker config:", error);
        if (error instanceof z.ZodError) {
            throw new Error(`Validation Error: ${error.issues.map(e => e.message).join(", ")}`);
        }
        throw new Error(error instanceof Error ? error.message : "Could not save configuration.");
    }
}

export async function fetchInviteLeaderboardAction(
    guildId: string,
    offset: number,
    limit = 15
): Promise<LeaderboardEntry[]> {
    const validGuildId = z.string().parse(guildId);
    const validOffset = z.number().int().nonnegative().parse(offset);
    const validLimit = z.number().int().positive().parse(limit);

    await verifyGuildAccess(validGuildId);
    return getInviteLeaderboard(validGuildId, validLimit, validOffset);
}