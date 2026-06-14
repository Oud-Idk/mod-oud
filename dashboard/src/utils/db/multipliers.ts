import { db } from "@/utils/init/db";

export interface XpMultiplier {
    guild_id: string;
    target_id: string;
    target_type: "channel" | "role";
    multiplier: number;
}

export async function getXpMultipliers(guildId: string): Promise<XpMultiplier[]> {
    const { rows } = await db.query(
        "SELECT guild_id, target_id, target_type, multiplier FROM xp_multipliers WHERE guild_id = $1",
        [guildId]
    );
    return rows;
}

export async function saveXpMultiplier(
    guildId: string,
    targetId: string,
    targetType: "channel" | "role",
    multiplier: number
) {
    await db.query(
        `INSERT INTO xp_multipliers (guild_id, target_id, target_type, multiplier)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (guild_id, target_id)
             DO UPDATE SET multiplier = EXCLUDED.multiplier`,
        [guildId, targetId, targetType, multiplier]
    );
}

export async function deleteXpMultiplier(guildId: string, targetId: string) {
    await db.query(
        "DELETE FROM xp_multipliers WHERE guild_id = $1 AND target_id = $2",
        [guildId, targetId]
    );
}

export async function deleteXpMultipliers(guildId: string, targetIds: string[]) {
    if (targetIds.length === 0) return;
    await db.query(
        "DELETE FROM xp_multipliers WHERE guild_id = $1 AND target_id = ANY($2)",
        [guildId, targetIds]
    );
}

export async function saveXpMultipliers(
    guildId: string,
    targets: Array<{ targetId: string; targetType: "channel" | "role"; multiplier: number }>
) {
    if (targets.length === 0) return;

    // Map targets to flat arrays for array parameters
    const targetIds = targets.map((t) => t.targetId);
    const targetTypes = targets.map((t) => t.targetType);
    const multipliers = targets.map((t) => t.multiplier);

    // This is fully static; your IDE will parse and highlight it correctly
    await db.query(
        `INSERT INTO xp_multipliers (guild_id, target_id, target_type, multiplier)
         SELECT $1, *
         FROM UNNEST($2::TEXT[], $3::TEXT[], $4::NUMERIC[])
         ON CONFLICT (guild_id, target_id)
             DO UPDATE SET multiplier = EXCLUDED.multiplier`,
        [guildId, targetIds, targetTypes, multipliers]
    );
}