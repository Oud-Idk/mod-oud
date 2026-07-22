import { db } from "@/utils/init/db";
import { QueryResult } from "pg";
import { DeletedMessage, EditedMessage } from "@/types/db/deletedEditedMessages";

export async function getEditedMessagesHistory(guildId: string): Promise<EditedMessage[]> {
    const query = `
        SELECT id,
               message_id,
               author_id,
               channel_id,
               guild_id,
               old_content,
               new_content,
               edited_at
        FROM modified_messages
        WHERE guild_id = $1
        ORDER BY id DESC
        LIMIT 10;
    `;
    const res: QueryResult = await db.query(query, [guildId]);
    return res.rows.map((row) => ({
        id: Number(row.id),
        message_id: row.message_id,
        author_id: row.author_id,
        channel_id: row.channel_id,
        guild_id: row.guild_id,
        old_content: row.old_content,
        new_content: row.new_content,
        updated_at: row.edited_at instanceof Date ? row.edited_at.toISOString() : row.edited_at,
    }));
}

export async function fetchMoreEditedMessages(guildId: string, beforeId: number): Promise<EditedMessage[]> {
    const query = `
        SELECT id,
               message_id,
               author_id,
               channel_id,
               guild_id,
               old_content,
               new_content,
               edited_at
        FROM modified_messages
        WHERE guild_id = $1
          AND id < $2
        ORDER BY id DESC
        LIMIT 10;
    `;
    try {
        const res: QueryResult = await db.query(query, [guildId, beforeId]);
        return res.rows.map((row) => ({
            id: Number(row.id),
            message_id: row.message_id,
            author_id: row.author_id,
            channel_id: row.channel_id,
            guild_id: row.guild_id,
            old_content: row.old_content,
            new_content: row.new_content,
            updated_at: row.edited_at instanceof Date ? row.edited_at.toISOString() : row.edited_at,
        }));
    } catch (err) {
        console.error("Failed to fetch older edit logs:", err);
        return [];
    }
}

export async function getDeletedMessagesHistory(guildId: string): Promise<DeletedMessage[]> {
    const query = `
        SELECT id,
               message_id,
               author_id,
               channel_id,
               guild_id,
               content,
               attachment_url,
               deleted_at
        FROM deleted_messages
        WHERE guild_id = $1
        ORDER BY deleted_at DESC
        LIMIT 50;
    `;
    const res: QueryResult = await db.query(query, [guildId]);
    return res.rows.map((row) => ({
        id: Number(row.id),
        message_id: row.message_id,
        author_id: row.author_id,
        channel_id: row.channel_id,
        guild_id: row.guild_id,
        content: row.content,
        attachment_url: row.attachment_url || "",
        deleted_at: row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at,
        deleted_by_id: row.deleted_by_id,
    }));
}

export async function fetchMoreDeletedMessages(guildId: string, beforeId: number): Promise<DeletedMessage[]> {
    const query = `
        SELECT id,
               message_id,
               author_id,
               channel_id,
               guild_id,
               content,
               attachment_url,
               deleted_at
        FROM deleted_messages
        WHERE guild_id = $1
          AND id < $2
        ORDER BY id DESC
        LIMIT 10;
    `;
    try {
        const res: QueryResult = await db.query(query, [guildId, beforeId]);
        return res.rows.map((row) => ({
            id: Number(row.id),
            message_id: row.message_id,
            author_id: row.author_id,
            channel_id: row.channel_id,
            guild_id: row.guild_id,
            content: row.content,
            attachment_url: row.attachment_url || "",
            deleted_at: row.deleted_at instanceof Date ? row.deleted_at.toISOString() : row.deleted_at,
            deleted_by_id: row.deleted_by_id,
        }));
    } catch (err) {
        console.error("Failed to fetch older logs:", err);
        return [];
    }
}