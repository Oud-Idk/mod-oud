import { db } from "@/lib/db";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import {
    SaveTicketConfigSchema,
    TicketConfigSchema,
    TicketHistorySchema,
    TicketSchema,
    type Ticket,
    type TicketConfig,
    type TicketHistory,
} from "./types";

export async function getTicketHistory(
    channelId: string
): Promise<TicketHistory | null> {
    const query = `
        SELECT t.id AS ticket_id,
               t.guild_id::TEXT,
               t.channel_id::TEXT,
               t.opener_id::TEXT,
               t.status,
               t.created_at,
               t.closed_at,
               t.last_activity,
               t.message_count,
               COALESCE(
                               JSON_AGG(
                               JSON_BUILD_OBJECT(
                                       'message_id', tm.message_id::TEXT,
                                       'author_id', tm.author_id::TEXT,
                                       'content', tm.content,
                                       'created_at', tm.created_at,
                                       'is_ticket_manager', tm.is_ticket_manager
                               ) ORDER BY tm.created_at
                                       ) FILTER (WHERE tm.id IS NOT NULL),
                               '[]'::JSON
               ) AS messages
        FROM tickets t
                 LEFT JOIN ticket_messages tm ON t.channel_id = tm.ticket_channel_id
        WHERE t.channel_id = $1
        GROUP BY t.id;
    `;

    const res = await db.query(query, [channelId] as unknown[]);
    if (res.rows.length === 0) return null;

    return TicketHistorySchema.parse(res.rows[0]);
}

export async function getTicketList(guildId: string): Promise<Ticket[]> {
    const query = `
        SELECT id,
               channel_id::TEXT,
               opener_id::TEXT,
               status,
               created_at,
               closed_at,
               message_count
        FROM tickets
        WHERE guild_id = $1
        ORDER BY created_at DESC;
    `;
    const res = await db.query(query, [guildId] as unknown[]);
    return res.rows.map((row) => TicketSchema.parse(row));
}

export async function getTicketConfig(guildId: string): Promise<TicketConfig> {
    const dbConfig = await getGuildConfigField<unknown>(guildId, "tickets");
    return TicketConfigSchema.parse(dbConfig ?? {});
}

export async function saveTicketConfig(guildId: string, config: TicketConfig): Promise<void> {
    await saveGuildConfigField(guildId, "tickets", config);
}