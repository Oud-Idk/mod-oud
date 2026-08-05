import { db } from "@/lib/db";
import {
    type DeletedMessage,
    deletedMessageSchema,
    type EditedMessage,
    editedMessageSchema,
    type MessageLoggingConfig,
    messageLoggingConfigSchema,
} from "./types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

async function queryEditedMessages(
    guildId: string,
    beforeId?: number,
    limit = 10
): Promise<EditedMessage[]> {
    const params: (string | number)[] = [guildId];
    let whereClause = "WHERE guild_id = $1";

    if (beforeId !== undefined) {
        params.push(beforeId);
        whereClause += ` AND id < $${params.length}`;
    }

    params.push(limit);
    const sql = `
        SELECT id, message_id, author_id, channel_id, guild_id, old_content, new_content, edited_at
        FROM modified_messages
        ${whereClause}
        ORDER BY id DESC
        LIMIT $${params.length}
    `;

    try {
        const res = await db.query(sql, params);
        return res.rows.map((row) =>
            editedMessageSchema.parse({
                id: Number(row.id),
                message_id: row.message_id,
                author_id: row.author_id,
                channel_id: row.channel_id,
                guild_id: row.guild_id,
                old_content: row.old_content,
                new_content: row.new_content,
                updated_at: row.edited_at,
            })
        );
    } catch (err) {
        console.error("Failed to fetch edited message history:", err);
        return [];
    }
}

export const getEditedMessagesHistory = (guildId: string): Promise<EditedMessage[]> =>
    queryEditedMessages(guildId);

export const fetchMoreEditedMessages = (guildId: string, beforeId: number): Promise<EditedMessage[]> =>
    queryEditedMessages(guildId, beforeId);


async function queryDeletedMessages(
    guildId: string,
    beforeId?: number,
    limit = 10
): Promise<DeletedMessage[]> {
    const params: (string | number)[] = [guildId];
    let whereClause = "WHERE guild_id = $1";

    if (beforeId !== undefined) {
        params.push(beforeId);
        whereClause += ` AND id < $${params.length}`;
    }

    params.push(limit);
    const sql = `
        SELECT id, message_id, author_id, channel_id, deleted_by_id, guild_id, content, attachment_url, deleted_at
        FROM deleted_messages
        ${whereClause}
        ORDER BY ${beforeId ? "id" : "deleted_at"} DESC
        LIMIT $${params.length}
    `;

    try {
        const res = await db.query(sql, params);
        return res.rows.map((row) =>
            deletedMessageSchema.parse({
                id: Number(row.id),
                message_id: row.message_id,
                author_id: row.author_id,
                channel_id: row.channel_id,
                deleted_by_id: row.deleted_by_id,
                guild_id: row.guild_id,
                content: row.content,
                attachment_url: row.attachment_url,
                deleted_at: row.deleted_at,
            })
        );
    } catch (err) {
        console.error("Failed to fetch deleted message history:", err);
        return [];
    }
}

export const getDeletedMessagesHistory = (guildId: string): Promise<DeletedMessage[]> =>
    queryDeletedMessages(guildId, undefined, 50);

export const fetchMoreDeletedMessages = (guildId: string, beforeId: number): Promise<DeletedMessage[]> =>
    queryDeletedMessages(guildId, beforeId, 10);


export async function getMessageLoggingConfig(guildId: string): Promise<MessageLoggingConfig> {
    const dbConfig = await getGuildConfigField<unknown>(guildId, "message_logging");
    return messageLoggingConfigSchema.parse(dbConfig ?? {});
}

export async function saveMessageLoggingConfig(guildId: string, config: MessageLoggingConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'message_logging', config);
}