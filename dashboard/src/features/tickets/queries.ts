import { db } from "@/lib/db";
import {
    TicketConfig,
    TicketConfigSchema,
    SaveTicketConfigSchema,
    TicketHistory,
    Ticket
} from "@/features/tickets/types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

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
                                       'is_ticket_manager', tm.is_ticket_manager -- Fixed typo here
                               ) ORDER BY tm.created_at
                                       ) FILTER (WHERE tm.id IS NOT NULL),
                               '[]'::JSON
               ) AS messages
        FROM tickets t
                 LEFT JOIN ticket_messages tm ON t.channel_id = tm.ticket_channel_id
        WHERE t.channel_id = $1
        GROUP BY t.id;
    `;

    try {
        const res = await db.query<TicketHistory>(query, [channelId]);

        if (res.rows.length === 0) {
            return null;
        }

        return res.rows[0];
    } catch (error) {
        console.error('Error fetching ticket history:', error);
        throw error;
    }
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
    const res = await db.query<Ticket>(query, [guildId]);
    return res.rows; // Fixed: Returning res.rows array
}

export async function getTicketConfig(guildId: string): Promise<TicketConfig> {
    const dbConfig = await getGuildConfigField<unknown>(guildId, 'tickets');

    return TicketConfigSchema.parse(dbConfig ?? {});
}

export async function saveTicketConfig(guildId: string, config: TicketConfig): Promise<void> {
    const validatedConfig = SaveTicketConfigSchema.parse(config);
    await saveGuildConfigField(guildId, 'tickets', validatedConfig);
}