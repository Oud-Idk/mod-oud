// features/warns/queries.ts
import redis from "@/lib/redis";
import { db } from "@/lib/db";
import { z } from "zod";
import {
    warnSchema,
    warnThresholdSchema,
    saveWarnThresholdsInputSchema,
    Warn,
    WarnThreshold,
    SaveWarnThresholdInput,
} from "./types";

export async function searchWarns(guildId: string, userId: string): Promise<Warn[]> {
    const validGuildId = z.string().parse(guildId);
    const validUserId = z.string().parse(userId);

    const query = `
        SELECT *
        FROM warns
        WHERE guild_id = $1
          AND user_id = $2;
    `;

    const res = await db.query(query, [validGuildId, validUserId]);
    return z.array(warnSchema).parse(res.rows);
}

export async function getWarnThresholds(guildId: string): Promise<WarnThreshold[]> {
    const validGuildId = z.string().parse(guildId);

    const query = `
        SELECT id,
               guild_id,
               warn_count,
               action_type::TEXT[]     AS action_type,
               roles_to_add::TEXT[]    AS roles_to_add,
               roles_to_remove::TEXT[] AS roles_to_remove,
               duration
        FROM warn_thresholds
        WHERE guild_id = $1
        ORDER BY warn_count;
    `;

    try {
        const res = await db.query(query, [validGuildId]);
        return z.array(warnThresholdSchema).parse(res.rows);
    } catch (error) {
        console.error(`Error loading warn thresholds for guild ${validGuildId}:`, error);
        return [];
    }
}

export async function saveWarnThresholds(
    guildId: string,
    thresholdsPayload: SaveWarnThresholdInput[]
): Promise<void> {
    const validGuildId = z.string().parse(guildId);
    const validThresholds = saveWarnThresholdsInputSchema.parse(thresholdsPayload);

    const client = await db.connect();

    try {
        await client.query("BEGIN");

        if (validThresholds.length === 0) {
            await client.query(`DELETE FROM warn_thresholds WHERE guild_id = $1`, [validGuildId]);
        } else {
            const values: unknown[] = [];
            const warnCounts: number[] = [];

            const placeholders = validThresholds.map((t, index) => {
                const offset = index * 6;
                values.push(
                    validGuildId,
                    t.warnCount,
                    t.actionType,
                    t.rolesToAdd ?? null,
                    t.rolesToRemove ?? null,
                    t.duration ?? null
                );
                warnCounts.push(t.warnCount);
                return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
            }).join(", ");

            const upsertQuery = `
                INSERT INTO warn_thresholds (guild_id, warn_count, action_type, roles_to_add, roles_to_remove, duration)
                VALUES ${placeholders}
                ON CONFLICT (guild_id, warn_count)
                DO UPDATE SET
                action_type = EXCLUDED.action_type,
                roles_to_add = EXCLUDED.roles_to_add,
                roles_to_remove = EXCLUDED.roles_to_remove,
                duration = EXCLUDED.duration;
            `;
            await client.query(upsertQuery, values);

            await client.query(`
                DELETE
                FROM warn_thresholds
                WHERE guild_id = $1
                  AND NOT (warn_count = ANY ($2::INT[]));
            `, [validGuildId, warnCounts]);
        }

        await client.query("COMMIT");
        await redis.del(`warn_thresholds:${validGuildId}`);
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function deleteWarnThresholds(guildId: string, ids: number[]): Promise<void> {
    const validGuildId = z.string().parse(guildId);
    const validIds = z.array(z.number().int()).parse(ids);

    if (validIds.length === 0) return;

    // Added guild_id = $1 check for tenant isolation security
    const query = `
        DELETE
        FROM warn_thresholds
        WHERE guild_id = $1
          AND id = ANY ($2::INT[]);
    `;
    await db.query(query, [validGuildId, validIds]);

    // Invalidate Redis cache on deletion
    await redis.del(`warn_thresholds:${validGuildId}`);
}