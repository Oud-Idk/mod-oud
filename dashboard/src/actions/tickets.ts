"use server";

import { Pool } from 'pg';
import { getTicketHistory, TicketHistory } from '@/utils/db/ticketHistory';

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
});

export interface TicketSummary {
    id: number;
    channel_id: string;
    opener_id: string;
    status: 'OPEN' | 'CLOSE';
    created_at: string;
    closed_at: string | null;
    message_count: number;
    opener_name: string;
}

/**
 * Fetches a list of tickets for a specific guild
 */
export async function getTicketsListAction(guildId: string): Promise<TicketSummary[]> {
    try {
        const query = `
            SELECT id,
                   channel_id::TEXT,
                   opener_id::TEXT,
                   status,
                   created_at,
                   closed_at,
                   message_count,
                   opener_name
            FROM tickets
            WHERE guild_id = $1
            ORDER BY created_at DESC;
        `;
        const res = await pool.query(query, [guildId]);
        return res.rows;
    } catch (error) {
        console.error("Failed to fetch ticket list:", error);
        throw new Error("Could not retrieve tickets list.");
    }
}

/**
 * Fetches the detailed message history of a specific ticket channel
 */
export async function getTicketHistoryAction(channelId: string): Promise<TicketHistory | null> {
    try {
        return await getTicketHistory(channelId);
    } catch (error) {
        console.error("Failed to fetch ticket history:", error);
        throw new Error("Could not retrieve ticket history.");
    }
}