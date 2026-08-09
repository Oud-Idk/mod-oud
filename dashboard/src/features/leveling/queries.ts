import { z } from "zod";
import { db } from "@/lib/db";
import { QueryResult } from "pg";
import {
    LevelingConfig,
    LevelReward,
    UserLevel,
    XpMultiplier,
    levelingConfigSchema,
    userLevelSchema,
    xpMultiplierSchema,
    levelRewardSchema,
    SaveXpMultiplierInput,
    SaveLevelRewardInput,
} from "@/features/leveling/types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getLevels(guildId: string): Promise<UserLevel[]> {
    const validGuildId = z.string().min(1).parse(guildId);
    const query = `
        SELECT *
        FROM levels
        WHERE guild_id = $1
        ORDER BY cumulative_xp DESC
        LIMIT 40;
    `;
    try {
        const res = await db.query(query, [validGuildId]);
        return z.array(userLevelSchema).parse(res.rows);
    } catch (error) {
        console.error(`Error fetching levels for guild ${guildId}:`, error);
        throw error;
    }
}

export async function fetchMoreLevels(guildId: string, currentLowestXp: number): Promise<UserLevel[]> {
    const validGuildId = z.string().min(1).parse(guildId);
    const validLowestXp = z.number().parse(currentLowestXp);

    const query = `
        SELECT *
        FROM levels
        WHERE guild_id = $1
          AND cumulative_xp < $2
        ORDER BY cumulative_xp DESC
        LIMIT 20;
    `;
    try {
        const res: QueryResult = await db.query(query, [validGuildId, validLowestXp]);
        return z.array(userLevelSchema).parse(res.rows);
    } catch (err) {
        console.error("Failed to fetch lower levels for guild:", err);
        return [];
    }
}

export async function getLevelingConfig(guildId: string): Promise<LevelingConfig> {
    const validGuildId = z.string().min(1).parse(guildId);
    const dbLeveling = await getGuildConfigField(validGuildId, "leveling");
    return levelingConfigSchema.parse(dbLeveling ?? {});
}

export async function saveLevelingConfig(guildId: string, config: LevelingConfig): Promise<void> {
    await saveGuildConfigField(guildId, "leveling", config);
}

export async function getXpMultipliers(guildId: string): Promise<XpMultiplier[]> {
    const validGuildId = z.string().min(1).parse(guildId);
    const { rows } = await db.query(
        "SELECT guild_id, target_id, target_type, multiplier FROM xp_multipliers WHERE guild_id = $1",
        [validGuildId]
    );
    return z.array(xpMultiplierSchema).parse(rows);
}

export async function getLevelRewards(guildId: string): Promise<LevelReward[]> {
    const validGuildId = z.string().min(1).parse(guildId);
    const { rows } = await db.query(
        "SELECT id, guild_id, level_requirement, roles_to_add, remove_previous_roles FROM level_rewards WHERE guild_id = $1",
        [validGuildId]
    );
    return z.array(levelRewardSchema).parse(rows);
}

export async function saveLevelRewards(
    guildId: string,
    rewards: SaveLevelRewardInput[]
): Promise<void> {
    if (rewards.length === 0) return;

    const payload = rewards.map((r) => ({
        level_requirement: r.levelRequirement,
        roles_to_add: r.rolesToAdd,
        remove_previous_roles: r.removePreviousRoles,
    }));

    await db.query(
        `INSERT INTO level_rewards (guild_id, level_requirement, roles_to_add, remove_previous_roles)
         SELECT $1, level_requirement, roles_to_add::bigint[], remove_previous_roles
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

export async function deleteXpMultipliers(guildId: string, targetIds: string[]): Promise<void> {
    if (targetIds.length === 0) return;

    await db.query(
        "DELETE FROM xp_multipliers WHERE guild_id = $1 AND target_id = ANY($2)",
        [guildId, targetIds]
    );
}

export async function saveXpMultipliers(
    guildId: string,
    targets: SaveXpMultiplierInput[]
): Promise<void> {
    if (targets.length === 0) return;

    const targetIds = targets.map((t) => t.targetId);
    const targetTypes = targets.map((t) => t.targetType);
    const multipliers = targets.map((t) => t.multiplier);

    await db.query(
        `INSERT INTO xp_multipliers (guild_id, target_id, target_type, multiplier)
         SELECT
             $1,
             u.target_id::bigint,
             u.target_type,
             u.multiplier
         FROM UNNEST($2::TEXT[], $3::TEXT[], $4::NUMERIC[]) AS u(target_id, target_type, multiplier)
         ON CONFLICT (guild_id, target_id)
             DO UPDATE SET multiplier = EXCLUDED.multiplier`,
        [guildId, targetIds, targetTypes, multipliers]
    );
}

export async function deleteLevelRewards(guildId: string, ids: number[]): Promise<void> {
    if (ids.length === 0) return;

    await db.query(
        "DELETE FROM level_rewards WHERE guild_id = $1 AND id = ANY($2::INTEGER[])",
        [guildId, ids]
    );
}