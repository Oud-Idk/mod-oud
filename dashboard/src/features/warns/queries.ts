import { db } from "@/lib/db";
import redis from "@/lib/redis";
import { type SaveWarnThresholdInput, type Warn, warnSchema, type WarnThreshold, warnThresholdSchema, } from "./types";

export async function searchWarns(guildId: string, userId: string): Promise<Warn[]> {
    const query = `
        SELECT *
        FROM warns
        WHERE guild_id = $1
          AND user_id = $2
        ORDER BY created_at DESC;
    `;

    const res = await db.query(query, [guildId, userId]);
    return res.rows.map((row) => warnSchema.parse(row));
}

export async function getWarnThresholds(guildId: string): Promise<WarnThreshold[]> {
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
        const res = await db.query(query, [guildId]);
        return res.rows.map((row) => warnThresholdSchema.parse(row));
    } catch (error) {
        console.error(`Error loading warn thresholds for guild ${guildId}:`, error);
        return [];
    }
}

export async function saveWarnThresholds(
    guildId: string,
    thresholds: SaveWarnThresholdInput[]
): Promise<void> {
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        if (thresholds.length === 0) {
            await client.query(`DELETE FROM warn_thresholds WHERE guild_id = $1`, [guildId]);
        } else {
            const values: unknown[] = [];
            const warnCounts: number[] = [];

            const placeholders = thresholds
                .map((t, index) => {
                    const offset = index * 6;
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
                })
                .join(", ");

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

            await client.query(
                `
                    DELETE
                    FROM warn_thresholds
                    WHERE guild_id = $1
                      AND NOT (warn_count = ANY ($2::INT[]));
                `,
                [guildId, warnCounts]
            );
        }

        await client.query("COMMIT");
        try {
            await redis.del(`warn_thresholds:${guildId}`);
        } catch (redisErr) {
            console.error(`Failed to clear cache for guild ${guildId}:`, redisErr);
        }
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

export async function deleteWarnThresholds(guildId: string, ids: number[]): Promise<void> {
    if (ids.length === 0) return;

    const query = `
        DELETE
        FROM warn_thresholds
        WHERE guild_id = $1
          AND id = ANY ($2::INT[]);
    `;
    await db.query(query, [guildId, ids]);

    try {
        await redis.del(`warn_thresholds:${guildId}`);
    } catch (redisErr) {
        console.error(`Failed to clear cache for guild ${guildId}:`, redisErr);
    }
}