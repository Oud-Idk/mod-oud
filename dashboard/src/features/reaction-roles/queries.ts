import { db } from "@/lib/db";
import {
    reactionMessageSchema,
    saveReactionMessageInputSchema,
    type ReactionMessage,
    type SaveReactionMessageInput,
} from "./types";

export async function getReactionMessages(guildId: string): Promise<ReactionMessage[]> {
    const query = `
        SELECT rm.id,
               rm.name,
               rm.message_id,
               rm.channel_id,
               rm.guild_id,
               rm.format,
               rm.mode,
               COALESCE(rm.embed, '')                 AS embed,
               COALESCE(rm.content, '')               AS content,
               (SELECT COALESCE(
                               JSON_AGG(JSON_BUILD_OBJECT('emoji', rr.emoji, 'role_id', rr.role_id::TEXT)),
                               '[]'
                       )
                FROM reaction_roles rr
                WHERE rr.reaction_message_id = rm.id) AS reactions,
               (SELECT COALESCE(
                               JSON_AGG(JSON_BUILD_OBJECT(
                                       'role_id', br.role_id::TEXT,
                                       'custom_id', br.custom_id,
                                       'label', br.label,
                                       'style', br.style,
                                       'emoji', br.emoji
                                        )),
                               '[]'
                       )
                FROM button_roles br
                WHERE br.reaction_message_id = rm.id) AS buttons
        FROM reaction_messages rm
        WHERE rm.guild_id = $1;
    `;

    const res = await db.query(query, [guildId]);

    // Zod validates and types each raw PostgreSQL row safely
    return res.rows.map((row) => reactionMessageSchema.parse(row));
}

export async function deleteReactionMessage(id: number): Promise<boolean> {
    const query = `DELETE FROM reaction_messages WHERE id = $1`;
    const res = await db.query(query, [id]);
    return (res.rowCount ?? 0) === 1;
}

export async function saveReactionMessage(
    rawData: SaveReactionMessageInput
): Promise<ReactionMessage> {
    const data = saveReactionMessageInputSchema.parse(rawData);
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        const mainParams = [
            data.message_id ?? null,
            data.channel_id,
            data.guild_id,
            data.format,
            data.mode,
            data.embed ?? null,
            data.content ?? null,
            data.name,
        ];

        let internalId: number;

        if (data.id) {
            const updateQuery = `
                UPDATE reaction_messages
                SET message_id = $1, channel_id = $2, guild_id = $3, format = $4,
                    mode = $5, embed = $6, content = $7, name = $8
                WHERE id = $9 RETURNING id;
            `;
            const res = await client.query(updateQuery, [...mainParams, data.id]);

            if (res.rowCount === 0) {
                throw new Error(`Reaction message with ID ${data.id} not found.`);
            }
            internalId = Number(res.rows[0].id);
        } else {
            const insertQuery = `
                INSERT INTO reaction_messages (message_id, channel_id, guild_id, format, mode, embed, content, name)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id;
            `;
            const res = await client.query(insertQuery, mainParams);
            internalId = Number(res.rows[0].id);
        }

        await client.query(`
            DELETE FROM reaction_roles WHERE reaction_message_id = $1;
            DELETE FROM button_roles WHERE reaction_message_id = $1;
        `, [internalId]);
        // 3. Insert child records cleanly using PostgreSQL UNNEST
        if (data.mode === "REACTION" && data.reactions.length > 0) {
            const query = `
                INSERT INTO reaction_roles (reaction_message_id, emoji, role_id)
                SELECT $1, * FROM UNNEST($2::text[], $3::text[])
                ON CONFLICT (reaction_message_id, emoji) DO UPDATE SET role_id = EXCLUDED.role_id;
            `;
            await client.query(query, [
                internalId,
                data.reactions.map((r) => r.emoji),
                data.reactions.map((r) => r.role_id),
            ]);
        } else if (data.mode === "BUTTON" && data.buttons.length > 0) {
            const query = `
                INSERT INTO button_roles (reaction_message_id, role_id, custom_id, label, style, emoji)
                SELECT $1, * FROM UNNEST($2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
                ON CONFLICT (reaction_message_id, custom_id)
                DO UPDATE SET
                    role_id = EXCLUDED.role_id,
                    label   = EXCLUDED.label,
                    style   = EXCLUDED.style,
                    emoji   = EXCLUDED.emoji;
            `;
            await client.query(query, [
                internalId,
                data.buttons.map((b) => b.role_id),
                data.buttons.map((b) => b.custom_id),
                data.buttons.map((b) => b.label ?? null),
                data.buttons.map((b) => b.style ?? "PRIMARY"),
                data.buttons.map((b) => b.emoji ?? null),
            ]);
        }

        await client.query("COMMIT");

        return reactionMessageSchema.parse({ ...data, id: internalId });
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("Failed to save reaction message:", error);
        throw error;
    } finally {
        client.release();
    }
}