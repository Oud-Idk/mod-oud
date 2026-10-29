import { db } from "@/lib/db";
import { ActiveRaid, RawActiveRaidRowSchema } from "../types";

/** The bot keeps a `raid_active_state` row for exactly as long as a raid is in progress. */
export async function getActiveRaid(guildId: string): Promise<ActiveRaid | null> {
    try {
        const result = await db.query(
            `SELECT raid_start_time FROM raid_active_state WHERE guild_id = $1`,
            [guildId]
        );

        const row: unknown = result.rows[0];
        if (row === undefined) return null;

        const parsed = RawActiveRaidRowSchema.safeParse(row);
        if (!parsed.success) {
            console.error("Failed to parse active raid row:", parsed.error);
            return null;
        }

        return { startedAt: parsed.data.raid_start_time };
    } catch (error) {
        console.error("Failed to fetch active raid:", error);
        return null;
    }
}
