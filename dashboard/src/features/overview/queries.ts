import { db } from "@/lib/db";
import { DiscordGuildDetails, GuildStats } from "@/features/overview/types";

export async function getGuildStats(guildId: string): Promise<GuildStats> {
    const defaultStats: GuildStats = {
        weeklyModerationCount: 0,
        weeklyResolvedTicketCount: 0,
        openTicketsCount: 0,
    };

    try {
        const query = `
            SELECT (SELECT COUNT(*)
                    FROM moderation_logs
                    WHERE created_at >= NOW() - INTERVAL '7 days'
                      AND guild_id = $1)                    AS weekly_moderation,
                   (SELECT COUNT(*)
                    FROM tickets
                    WHERE guild_id = $1
                      AND status = 'CLOSED'::TICKET_STATUS) AS weekly_resolved,
                   (SELECT COUNT(*)
                    FROM tickets
                    WHERE guild_id = $1
                      AND status = 'OPEN'::TICKET_STATUS)   AS open_tickets;
        `;

        const result = await db.query(query, [guildId]);
        const row = result.rows[0];

        if (!row) return defaultStats;

        return {
            weeklyModerationCount: row.weekly_moderation ? parseInt(row.weekly_moderation, 10) : 0,
            weeklyResolvedTicketCount: row.weekly_resolved ? parseInt(row.weekly_resolved, 10) : 0,
            openTicketsCount: row.open_tickets ? parseInt(row.open_tickets, 10) : 0,
        };
    } catch (error) {
        console.error("Database error fetching guild stats:", error);
        return defaultStats;
    }
}

export async function getGuildDetails(guildId: string): Promise<DiscordGuildDetails | null> {
    const botToken = process.env.DISCORD_TOKEN;
    if (!botToken) return null;

    try {
        const response = await fetch(
            `https://discord.com/api/v10/guilds/${guildId}?with_counts=true`,
            {
                headers: { Authorization: `Bot ${botToken}` },
                next: { revalidate: 30 },
            }
        );
        if (!response.ok) return null;
        return await response.json();
    } catch (error) {
        console.error("Failed to fetch guild details:", error);
        return null;
    }
}