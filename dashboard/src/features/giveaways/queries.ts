import { z } from "zod";
import { db } from "@/lib/db";
import {
    Giveaway,
    SaveGiveawayData,
    giveawaySchema,
    saveGiveawayInputSchema
} from "@/features/giveaways/types";

export async function getGiveaways(guildId: string): Promise<Giveaway[]> {
    const validGuildId = z.string().min(1).parse(guildId);

    const query = `
        SELECT id,
               guild_id,
               host_id,
               channel_id,
               message_id,
               prize,
               winner_count,
               end_time,
               is_finished,
               format,
               COALESCE(embed, '{}'::jsonb) AS embed,
               COALESCE(content, '') AS content
        FROM giveaways
        WHERE guild_id = $1
        ORDER BY id DESC;
    `;
    const res = await db.query(query, [validGuildId]);

    return z.array(giveawaySchema).parse(res.rows);
}

export async function saveGiveaway(dataPayload: SaveGiveawayData): Promise<Giveaway> {
    const data = saveGiveawayInputSchema.parse(dataPayload);

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
            data.channel_id ?? null,
            data.guild_id,
            data.prize,
            data.winner_count,
            data.end_time,
            data.format,
            data.embed ? JSON.stringify(data.embed) : null,
            data.content ?? null,
            data.host_id,
            data.id
        ]);

        return giveawaySchema.parse(res.rows[0]);
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
            data.channel_id ?? null,
            data.guild_id,
            data.prize,
            data.winner_count || 1,
            data.end_time,
            data.format,
            data.embed ? JSON.stringify(data.embed) : null,
            data.content ?? null,
            data.host_id,
        ]);

        return giveawaySchema.parse(res.rows[0]);
    }
}

export async function deleteGiveaway(id: number, guildId?: string): Promise<boolean> {
    const validId = z.number().int().positive().parse(id);

    let query = `DELETE FROM giveaways WHERE id = $1`;
    const params: (number | string)[] = [validId];

    if (guildId) {
        const validGuildId = z.string().parse(guildId);
        query += ` AND guild_id = $2`;
        params.push(validGuildId);
    }

    const res = await db.query(query, params);
    return (res.rowCount ?? 0) > 0;
}