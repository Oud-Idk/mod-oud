import { db } from "@/utils/init/db";
import { Giveaway } from "@/types/db/giveaway";

export type SaveGiveawayData = Omit<Giveaway, 'id'> & { id?: number };

export async function getGiveaways(guildId: string): Promise<Giveaway[]> {
    const query = `
        SELECT id,
               guild_id,
               channel_id,
               message_id,
               prize,
               winner_count,
               end_time,
               is_finished,
               format,
               COALESCE(embed, '{}') AS embed,
               COALESCE(content, '') AS content
        FROM giveaways
        WHERE guild_id = $1
        ORDER BY id DESC;
    `;
    const res = await db.query(query, [guildId]);
    return res.rows;
}

export async function saveGiveaway(data: SaveGiveawayData): Promise<Giveaway> {
    if (data.id) {
        const query = `
            UPDATE giveaways
            SET channel_id   = $1,
                guild_id     = $2,
                prize        = $3,
                winner_count = $4,
                end_time     = $5,
                format       = $6,
                embed        = $7,
                content      = $8,
                host_id      = $9
            WHERE id = $10
            RETURNING *;
        `;

        const res = await db.query(query, [
            data.channel_id,
            data.guild_id,
            data.prize,
            data.winner_count,
            data.end_time,
            data.format,
            data.embed ?? null,
            data.content ?? null,
            data.host_id,
            data.id
        ]);

        return res.rows[0];
    } else {
        const query = `
            INSERT INTO giveaways (channel_id,
                                   guild_id,
                                   prize,
                                   winner_count,
                                   end_time,
                                   format,
                                   embed,
                                   content,
                                   host_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *;
        `;

        const res = await db.query(query, [
            data.channel_id,
            data.guild_id,
            data.prize,
            data.winner_count || 1,
            data.end_time,
            data.format,
            data.embed ?? null,
            data.content ?? null,
            data.host_id,
        ]);

        return res.rows[0];
    }
}

export async function deleteGiveaway(id: number): Promise<boolean> {
    const res = await db.query(`DELETE
                                FROM giveaways
                                WHERE id = $1`, [id]);
    return res.rowCount === 1;
}