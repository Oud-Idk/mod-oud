import { db } from "@/utils/init/db";

export type TicketStatus = 'OPEN' | 'CLOSE';

export interface TicketMessage {
    message_id: string;
    author_id: string;
    content: string;
    created_at: string;
    sender_name: string;
    is_ticket_manager: boolean;
}

export interface TicketHistory {
    ticket_id: number;
    guild_id: string;
    channel_id: string;
    opener_id: string;
    status: TicketStatus;
    created_at: Date;
    closed_at: Date | null;
    last_activity: Date;
    message_count: number;
    messages: TicketMessage[];
    opener_name: string;
}

/**
 * Retrieves the full history of a ticket, including its metadata and all messages.
 *
 * @param channelId - The channel_id of the ticket to retrieve.
 * @returns The ticket history object, or null if not found.
 */
export async function getTicketHistory(
    channelId: string | number
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
               t.opener_name,
               COALESCE(
                               JSON_AGG(
                               JSON_BUILD_OBJECT(
                                       'message_id', tm.message_id::TEXT,
                                       'author_id', tm.author_id::TEXT,
                                       'content', tm.content,
                                       'created_at', tm.created_at,
                                       'sender_name', tm.sender_name,
                                       'is_ticket_manager', tm.is_ticket_manger
                               ) ORDER BY tm.created_at
                                       ) FILTER (WHERE tm.id IS NOT NULL),
                               '[]'::JSON
               )    AS messages
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