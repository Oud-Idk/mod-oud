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
    let whereClause = "WHERE guild_id = $1";

    if (validBeforeId !== undefined) {
        params.push(validBeforeId);
        whereClause += ` AND id < $${params.length}`;
    }

    params.push(validLimit);
    const sql = `
        SELECT id, message_id, author_id, channel_id, guild_id, old_content, new_content, edited_at AS updated_at
        FROM modified_messages
                 ${whereClause}
        ORDER BY id DESC
        LIMIT $${params.length}
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
    let whereClause = "WHERE guild_id = $1";

    if (validBeforeId !== undefined) {
        params.push(validBeforeId);
        whereClause += ` AND id < $${params.length}`;
    }

    params.push(validLimit);
    const sql = `
        SELECT id, message_id, author_id, channel_id, deleted_by_id, guild_id, content, attachment_url, deleted_at
        FROM deleted_messages
                 ${whereClause}
        ORDER BY ${validBeforeId ? "id" : "deleted_at"} DESC
        LIMIT $${params.length}
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