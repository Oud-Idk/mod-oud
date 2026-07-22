import { db } from "@/utils/init/db";
import { ReactionMessage } from "@/types/db/reactionRole";

export type SaveReactionMessageData = Omit<ReactionMessage, 'id'> & { id?: number };

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
    return res.rows;
}

export async function deleteReactionMessage(id: number): Promise<boolean> {
    const query = `DELETE
                   FROM reaction_messages
                   WHERE id = $1`;
    const res = await db.query(query, [id]);
    return res.rowCount === 1;
}

export async function saveReactionMessage(data: SaveReactionMessageData): Promise<ReactionMessage> {
    const client = await db.connect();

    try {
        await client.query("BEGIN");

        let internalId: number;

        if (data.id) {
            const updateQuery = `
                UPDATE reaction_messages
                SET message_id = $1,
                    channel_id = $2,
                    guild_id   = $3,
                    format     = $4,
                    mode       = $5,
                    embed      = $6,
                    content    = $7,
                    name       = $8
                WHERE id = $9
                RETURNING id;
            `;
            const res = await client.query(updateQuery, [
                data.message_id || null,
                data.channel_id,
                data.guild_id,
                data.format,
                data.mode,
                data.embed || null,
                data.content || null,
                data.name,
                data.id
            ]);

            if (res.rowCount === 0) {
                throw new Error(`Reaction message with ID ${data.id} not found.`);
            }
            internalId = res.rows[0].id;
        } else {
            // INSERT configuration
            const insertQuery = `
                INSERT INTO reaction_messages (message_id, channel_id, guild_id, format, mode, embed, content, name)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                RETURNING id;
            `;
            const res = await client.query(insertQuery, [
                data.message_id || null,
                data.channel_id,
                data.guild_id,
                data.format,
                data.mode,
                data.embed || null,
                data.content || null,
                data.name,
            ]);
            internalId = res.rows[0].id;
        }

        // Clean up both tables to handle transitions when switching modes
        await client.query("DELETE FROM reaction_roles WHERE reaction_message_id = $1", [internalId]);
        await client.query("DELETE FROM button_roles WHERE reaction_message_id = $1", [internalId]);

        // Insert new relations depending on the selected mode
        if (data.mode === "REACTION" && data.reactions && data.reactions.length > 0) {
            const values: any[] = [];
            const valueStrings = data.reactions.map((r, i) => {
                const offset = i * 3;
                values.push(internalId, r.emoji, r.role_id);
                return `($${offset + 1}, $${offset + 2}, $${offset + 3})`;
            });

            const insertRolesQuery = `
                INSERT INTO reaction_roles (reaction_message_id, emoji, role_id)
                VALUES
                ${valueStrings.join(", ")}
                ON CONFLICT (reaction_message_id, emoji)
                DO UPDATE SET role_id = EXCLUDED.role_id;
            `;
            await client.query(insertRolesQuery, values);
        } else if (data.mode === "BUTTON" && data.buttons && data.buttons.length > 0) {
            const values: any[] = [];
            const valueStrings = data.buttons.map((b, i) => {
                const offset = i * 6;
                values.push(
                    internalId,
                    b.role_id,
                    b.custom_id,
                    b.label || null,
                    b.style || "PRIMARY",
                    b.emoji || null
                );
                return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6})`;
            });

            const insertButtonsQuery = `
                INSERT INTO button_roles (reaction_message_id, role_id, custom_id, label, style, emoji)
                VALUES
                ${valueStrings.join(", ")}
                ON CONFLICT (reaction_message_id, custom_id)
                DO UPDATE SET role_id = EXCLUDED.role_id,
                LABEL = EXCLUDED.label,
                style = EXCLUDED.style,
                emoji = EXCLUDED.emoji;
            `;
            await client.query(insertButtonsQuery, values);
        }

        await client.query("COMMIT");

        return { ...data, id: internalId };

    } catch (e) {
        await client.query("ROLLBACK");
        console.error("Failed to save reaction message:", e);
        throw e;
    } finally {
        client.release();
    }
}