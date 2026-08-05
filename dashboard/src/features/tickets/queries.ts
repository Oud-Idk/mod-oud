import { db } from "@/lib/db";
import { MessageLayout, TicketConfig, TicketHistory } from "@/features/tickets/types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

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
               COALESCE(
                               JSON_AGG(
                               JSON_BUILD_OBJECT(
                                       'message_id', tm.message_id::TEXT,
                                       'author_id', tm.author_id::TEXT,
                                       'content', tm.content,
                                       'created_at', tm.created_at,
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

export async function getTicketList(guildId: string) {
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
    const res = await db.query(query, [guildId]);
    return res;
}

export async function getTicketConfig(guildId: string): Promise<TicketConfig> {
    const defaultMessageConfig: MessageLayout = {
        enabled: false,
        format: "TEXT",
        content: "",
        embed: {},
    }

    const defaultConfig: TicketConfig = {
        categoryId: "",
        enabled: false,
        channelId: "",
        format: "TEXT",
        content: "",
        embed: {},
        postedMessageId: "",
        ticketRoleId: "",
        warnThreshold: 30,
        deleteThreshold: 45,
        bumpEvery: 20,
        welcomeMessage: defaultMessageConfig,
    }


    const dbConfig = await getGuildConfigField<TicketConfig>(guildId, 'tickets');
    if (!dbConfig) return defaultConfig;

    return {
        ...defaultConfig,
        ...dbConfig || {},
        welcomeMessage: {
            ...defaultMessageConfig,
            ...(dbConfig.welcomeMessage || {}),
        }
    }
}

export async function saveTicketConfig(guildId: string, config: TicketConfig): Promise<void> {
    await saveGuildConfigField(guildId, 'tickets', config);
}