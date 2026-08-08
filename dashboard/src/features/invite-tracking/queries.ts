import { z } from "zod";
import {
    InviteTrackerConfig,
    LeaderboardEntry,
    inviteTrackerConfigSchema,
    leaderboardEntrySchema,
    getLeaderboardInputSchema
} from "@/features/invite-tracking/types";
import { db } from "@/lib/db";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getInviteTrackerConfig(guildId: string): Promise<InviteTrackerConfig> {
    const validGuildId = z.string().parse(guildId);

    const dbConfig = await getGuildConfigField<unknown>(validGuildId, "invite_tracker");
    return inviteTrackerConfigSchema.parse(dbConfig ?? {});
}

export async function saveInviteTrackerConfig(guildId: string, config: InviteTrackerConfig): Promise<void> {
    await saveGuildConfigField(guildId, "invite_tracker", config);
}

export async function getInviteLeaderboard(
    guildId: string,
    limit = 15,
    offset = 0
): Promise<LeaderboardEntry[]> {
    try {
        const validParams = getLeaderboardInputSchema.parse({ guildId, limit, offset });

        const query = `
            SELECT inviter_id::TEXT AS "inviterId",
                   count::INTEGER   AS "count"
            FROM inviter_counts
            WHERE guild_id = $1
            ORDER BY count DESC
            LIMIT $2 OFFSET $3;
        `;
        const res = await db.query(query, [
            validParams.guildId,
            validParams.limit,
            validParams.offset
        ] as unknown[]);

        return z.array(leaderboardEntrySchema).parse(res.rows);
    } catch (error) {
        console.error("Failed to fetch invite leaderboard:", error);
        return [];
    }
}