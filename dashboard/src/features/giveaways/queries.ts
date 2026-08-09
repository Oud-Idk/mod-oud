import { z } from "zod";
import { db } from "@/lib/db";
import {
    Giveaway,
    SaveGiveawayData,
    giveawaySchema,
    SaveGiveawaySchema,
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
               message_layout AS message
        FROM giveaways
        WHERE guild_id = $1
        ORDER BY id DESC;
    `;
    const res = await db.query(query, [validGuildId]);

    return z.array(giveawaySchema).parse(res.rows);
}

export async function saveGiveaway(data: SaveGiveawayData): Promise<Giveaway> {
    const validData = SaveGiveawaySchema.parse(data);

    const messageLayout = JSON.stringify(
        typeof validData.message === "object" && validData.message !== null
            ? { enabled: true, ...validData.message }
            : validData.message
    );

    if (validData.id) {
        const query = `
            UPDATE giveaways
            SET channel_id     = $1,
                guild_id       = $2,
                prize          = $3,
                winner_count   = $4,
                end_time       = $5,
                host_id        = $6,
                message_layout = $7
            WHERE id = $8 AND guild_id = $2
            RETURNING id,
                guild_id,
                host_id,
                channel_id,
                message_id,
                prize,
                winner_count,
                end_time,
                is_finished,
                message_layout AS message;
        `;

        const res = await db.query(query, [
            validData.channel_id ?? null,
            validData.guild_id,
            validData.prize,
            validData.winner_count ?? 1,
            validData.end_time,
            validData.host_id,
            messageLayout,
            validData.id,
        ]);

        return giveawaySchema.parse(res.rows[0]);
    } else {
        const query = `
            INSERT INTO giveaways (
                channel_id,
                guild_id,
                prize,
                winner_count,
                end_time,
                host_id,
                message_layout
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id,
                guild_id,
                host_id,
                channel_id,
                message_id,
                prize,
                winner_count,
                end_time,
                is_finished,
                message_layout AS message;
        `;

        const res = await db.query(query, [
            validData.channel_id ?? null,
            validData.guild_id,
            validData.prize,
            validData.winner_count ?? 1,
            validData.end_time,
            validData.host_id,
            messageLayout,
        ]);

        return giveawaySchema.parse(res.rows[0]);
    }
}
export async function deleteGiveaway(id: number, guildId: string): Promise<boolean> {
    const validId = z.number().int().positive().parse(id);
    const validGuildId = z.string().parse(guildId);

    const res = await db.query(`DELETE FROM giveaways WHERE id = $1 AND guild_id = $2`, [validId, validGuildId]);
    return (res.rowCount ?? 0) > 0;
}