import { z } from "zod";
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
    const validGuildId = z.string().min(1).parse(guildId);
    const validBeforeId = beforeId !== undefined ? z.number().int().parse(beforeId) : undefined;
    const validLimit = z.number().int().positive().parse(limit);

    const params: unknown[] = [validGuildId];
    let whereClause = "WHERE m.guild_id = $1";

    if (validBeforeId !== undefined) {
        params.push(validBeforeId);
        whereClause += ` AND m.id < $${params.length.toString()}`;
    }

    params.push(validLimit);
    const sql = `
        SELECT m.id, m.message_id, m.author_id, COALESCE(u.username, '') AS author_username,
               m.channel_id, m.guild_id, m.old_content, m.new_content, m.edited_at AS updated_at
        FROM modified_messages m
        LEFT JOIN discord_users u ON u.user_id = m.author_id
                 ${whereClause}
        ORDER BY m.id DESC
        LIMIT $${params.length.toString()}
    `;

    try {
        const res = await db.query(sql, params);
        return z.array(editedMessageSchema).parse(res.rows);
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
    const validGuildId = z.string().min(1).parse(guildId);
    const validBeforeId = beforeId !== undefined ? z.number().int().parse(beforeId) : undefined;
    const validLimit = z.number().int().positive().parse(limit);

    const params: unknown[] = [validGuildId];
    let whereClause = "WHERE d.guild_id = $1";

    if (validBeforeId !== undefined) {
        params.push(validBeforeId);
        whereClause += ` AND d.id < $${params.length.toString()}`;
    }

    params.push(validLimit);
    const sql = `
        SELECT d.id, d.message_id, d.author_id, COALESCE(a.username, '') AS author_username,
               d.channel_id, d.deleted_by_id, COALESCE(b.username, '') AS deleted_by_username,
               d.guild_id, d.content, d.attachment_url, d.deleted_at
        FROM deleted_messages d
        LEFT JOIN discord_users a ON a.user_id = d.author_id
        LEFT JOIN discord_users b ON b.user_id = d.deleted_by_id
                 ${whereClause}
        ORDER BY ${validBeforeId !== undefined ? "d.id" : "d.deleted_at"} DESC
        LIMIT $${params.length.toString()}
    `;

    try {
        const res = await db.query(sql, params);
        return z.array(deletedMessageSchema).parse(res.rows);
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
    const validGuildId = z.string().min(1).parse(guildId);
    const dbConfig = await getGuildConfigField(validGuildId, "message_logging");
    return messageLoggingConfigSchema.parse(dbConfig ?? {});
}

export async function saveMessageLoggingConfig(guildId: string, config: MessageLoggingConfig): Promise<void> {
    await saveGuildConfigField(guildId, "message_logging", config);
}