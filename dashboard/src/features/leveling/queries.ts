import { db } from "@/lib/db";
import { QueryResult } from "pg";
import { LevelingConfig, LevelReward, TargetType, UserLevel, XpMultiplier } from "@/features/leveling/types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

export async function getLevels(guildId: string): Promise<UserLevel[]> {
    const query = `
        SELECT *
        FROM levels
        WHERE guild_id = $1
        ORDER BY cumulative_xp DESC
        LIMIT 40;
    `;
    try {
        const res = await db.query(query, [guildId]);
        return res.rows;
    } catch (error) {
        console.error(`Error fetching levels for guild ${guildId}:`, error);
        throw error;
    }
}

export async function fetchMoreLevels(guildId: string, currentLowestXp: number): Promise<UserLevel[]> {
    const query = `
        SELECT *
        FROM levels
        WHERE guild_id = $1
          AND cumulative_xp < $2
        ORDER BY cumulative_xp DESC
        LIMIT 20;
    `;
    try {
        const res: QueryResult = await db.query(query, [guildId, currentLowestXp]);
        return res.rows;
    } catch (err) {
        console.error("Failed to fetch lower levels for guild:", err);
        return [];
    }
}

export async function getLevelingConfig(guildId: string): Promise<LevelingConfig> {
    const defaultConfig: LevelingConfig = {
        text: {
            enabled: false,
            xpCooldown: 60,
            xpRange: { min: 15, max: 25 },
            xpOnTickets: false,
        },
        voice: {
            xpRange: { min: 25, max: 50 },
            enabled: false,
        },
        scope: {
            mode: "EXEMPT",
            roles: [],
            channels: [],
        },
        levelCap: 40,
        keepLevelOnLeave: false,
        notify: {
            channelId: "",
            scope: "NONE",
            format: "TEXT",
            content: "",
            embed: {},
        },
        imageCard: {
            lineSeparatorColor: "#FFFFFF",
            accentColor: "#5865f2",
            barForegroundColor: "#5865f2",
            barBackgroundColor: "#FFFFFF",
            textColor: "#FFFFFF",
            usernameColor: "#FFFFFF",
            statisticsColor: "#FFFFFF",
            backgroundColor: "#000000",
        }
    }

    const dbLeveling = await getGuildConfigField<LevelingConfig>(guildId, 'leveling');
    if (!dbLeveling) return defaultConfig;

    return {
        ...defaultConfig,
        ...dbLeveling,
    }
}

export async function saveLevelingConfig(guildId: string, config: LevelingConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'leveling', config);
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

export async function deleteXpMultipliers(guildId: string, targetIds: string[]) {
    if (targetIds.length === 0) return;
    await db.query(
        "DELETE FROM xp_multipliers WHERE guild_id = $1 AND target_id = ANY($2)",
        [guildId, targetIds]
    );
}

export async function saveXpMultipliers(
    guildId: string,
    targets: Array<{ targetId: string; targetType: TargetType; multiplier: number }>
) {
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

export async function deleteLevelRewards(guildId: string, ids: number[]) {
    if (ids.length === 0) return;
    await db.query(
        "DELETE FROM level_rewards WHERE guild_id = $1 AND id = ANY($2::INTEGER[])",
        [guildId, ids]
    );
}