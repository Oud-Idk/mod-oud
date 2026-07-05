"use server";

import { db } from "@/utils/init/db";
import { QueryResult } from "pg";
import { revalidatePath } from "next/cache";

export interface Warn {
    id: string;
    user_id: string;
    user_name: string,
    guild_id: string;
    moderator_id: string;
    moderator_name: string,
    reason: string;
    created_at: Date;
    isActive: boolean;
}

export async function searchWarns(guild_id: string, user_id: string) {
    const query = `
        SELECT *
        FROM warns
        WHERE guild_id = $1
          AND user_id = $2
    `;

    const res: QueryResult<Warn> = await db.query(query, [guild_id, user_id]);

    return res.rows;
}

export type ModerationAction = 'timeout' | 'kick' | 'ban' | 'role_remove' | 'role_add' | 'role_remove_all';

export interface WarnThreshold {
    id: number;
    guild_id: string;
    warn_count: number;
    action_type: ModerationAction[];
    roles_to_add?: string[];
    roles_to_remove?: string[];
    duration: number | null;
}

export async function saveWarnThresholds(
    guildId: string,
    thresholds: Array<{
        warnCount: number;
        actionType: ModerationAction[];
        rolesToAdd?: string[] | null;
        rolesToRemove?: string[] | null;
        duration?: number | null
    }>
) {
    const client = await db.connect();

    try {
        await client.query('BEGIN');

        if (thresholds.length === 0) {
            await client.query(`DELETE
                                FROM warn_thresholds
                                WHERE guild_id = $1`, [guildId]);
        } else {
            const values: any[] = [];
            const warnCounts: number[] = [];

            const placeholders = thresholds.map((t, index) => {
                const offset = index * 6; // Updated to 6 parameters per row
                values.push(
                    guildId,
                    t.warnCount,
                    t.actionType,
                    t.rolesToAdd ?? null,
                    t.rolesToRemove ?? null,
                    t.duration ?? null
                );
                warnCounts.push(t.warnCount);
                return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
            }).join(', ');

            const upsertQuery = `
                INSERT INTO warn_thresholds (guild_id, warn_count, action_type, roles_to_add, roles_to_remove, duration)
                VALUES
                ${placeholders}
                ON CONFLICT (guild_id, warn_count)
                DO UPDATE SET
                action_type = EXCLUDED.action_type,
                roles_to_add = EXCLUDED.roles_to_add,
                roles_to_remove = EXCLUDED.roles_to_remove,
                duration = EXCLUDED.duration
            `;
            await client.query(upsertQuery, values);

            await client.query(`
                DELETE
                FROM warn_thresholds
                WHERE guild_id = $1
                  AND NOT (warn_count = ANY ($2::INT[]))
            `, [guildId, warnCounts]);
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        throw error;
    } finally {
        client.release();
    }

    revalidatePath(`/guilds/${guildId}/warns`);
}

export async function deleteWarnThresholds(guildId: string, ids: number[]) {
    if (ids.length === 0) return;

    const query = `
        DELETE
        FROM warn_thresholds
        WHERE id = ANY ($1::INT[])
    `;
    await db.query(query, [ids]);
    revalidatePath(`/guilds/${guildId}/warns`);
}

export async function getWarnThresholds(guildId: string): Promise<WarnThreshold[]> {
    const query = `
        SELECT id, guild_id, warn_count, action_type, roles_to_add, roles_to_remove, duration
        FROM warn_thresholds
        WHERE guild_id = $1
        ORDER BY warn_count;
    `;

    try {
        const res: QueryResult<WarnThreshold> = await db.query(query, [guildId]);
        return res.rows;
    } catch (error) {
        console.error(`Error loading warn thresholds for guild ${guildId}:`, error);

        return [];
    }
}