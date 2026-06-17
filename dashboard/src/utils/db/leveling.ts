import { db } from "@/utils/init/db";

export interface XpMultiplier {
    guild_id: string;
    target_id: string;
    target_type: "channel" | "role";
    multiplier: number;
}

export interface LevelReward {
    id: number;
    guild_id: string;
    level_requirement: number;
    roles_to_add: string[];
    remove_previous_roles: boolean;
}

export async function getXpMultipliers(guildId: string): Promise<XpMultiplier[]> {
    const { rows } = await db.query(
        "SELECT guild_id, target_id, target_type, multiplier FROM xp_multipliers WHERE guild_id = $1",
        [guildId]
    );
    return rows;
}

export async function getLevelRewards(guildId: string): Promise<LevelReward[]> {
    const { rows } = await db.query(
        "SELECT id, guild_id, level_requirement, roles_to_add, remove_previous_roles FROM level_rewards WHERE guild_id = $1",
        [guildId]
    );
    return rows;
}

export async function saveLevelRewards(
    guildId: string,
    rewards: Array<{ levelRequirement: number; rolesToAdd: string[]; removePreviousRoles: boolean }>
) {
    if (rewards.length === 0) return;

    // Map keys to match the expected aliases in the SQL json_to_recordset call
    const payload = rewards.map((r) => ({
        level_requirement: r.levelRequirement,
        roles_to_add: r.rolesToAdd,
        remove_previous_roles: r.removePreviousRoles,
    }));

    await db.query(
        `INSERT INTO level_rewards (guild_id, level_requirement, roles_to_add, remove_previous_roles)
         SELECT $1, level_requirement, roles_to_add, remove_previous_roles
         FROM JSON_TO_RECORDSET($2::JSON) AS x(
                                               level_requirement INTEGER,
                                               roles_to_add VARCHAR[],
                                               remove_previous_roles BOOLEAN
             )
         ON CONFLICT (guild_id, level_requirement)
             DO UPDATE SET roles_to_add          = EXCLUDED.roles_to_add,
                           remove_previous_roles = EXCLUDED.remove_previous_roles`,
        [guildId, JSON.stringify(payload)]
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

    const targetIds = targets.map((t) => t.targetId);
    const targetTypes = targets.map((t) => t.targetType);
    const multipliers = targets.map((t) => t.multiplier);

    await db.query(
        `INSERT INTO xp_multipliers (guild_id, target_id, target_type, multiplier)
         SELECT $1, *
         FROM UNNEST($2::TEXT[], $3::TEXT[], $4::NUMERIC[])
         ON CONFLICT (guild_id, target_id)
             DO UPDATE SET multiplier = EXCLUDED.multiplier`,
        [guildId, targetIds, targetTypes, multipliers]
    );
}

export async function deleteLevelRewards(guildId: string, ids: number[]) {
    if (ids.length === 0) return;
    await db.query(
        "DELETE FROM level_rewards WHERE guild_id = $1 AND id = ANY($2::INTEGER[])",
        [guildId, ids]
    );
}