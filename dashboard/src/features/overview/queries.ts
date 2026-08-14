import { db } from "@/lib/db";
import {
    DiscordGuildDetails,
    DiscordGuildDetailsSchema,
    GuildStats,
    RawGuildStatsSchema,
} from "@/features/overview/types";

const DEFAULT_STATS: GuildStats = {
    weeklyModerationCount: 0,
    weeklyResolvedTicketCount: 0,
    openTicketsCount: 0,
};

export async function getGuildStats(guildId: string): Promise<GuildStats> {
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
        if (result.rows.length === 0) return DEFAULT_STATS;

        // Validate & transform the raw row
        const parsed = RawGuildStatsSchema.safeParse(result.rows[0]);
        if (!parsed.success) {
            console.error("Failed to parse DB stats row:", parsed.error);
            return DEFAULT_STATS;
        }

        return {
            weeklyModerationCount: parsed.data.weekly_moderation,
            weeklyResolvedTicketCount: parsed.data.weekly_resolved,
            openTicketsCount: parsed.data.open_tickets,
        };
    } catch (error) {
        console.error("Database error fetching guild stats:", error);
        return DEFAULT_STATS;
    }
}

export async function getGuildDetails(guildId: string): Promise<DiscordGuildDetails | null> {
    const botToken = process.env.DISCORD_TOKEN;
    if (botToken === undefined || botToken.trim() === "") {
        return null;
    }

    try {
        const response = await fetch(
            `https://discord.com/api/v10/guilds/${guildId}?with_counts=true`,
            {
                headers: { Authorization: `Bot ${botToken}` },
                next: { revalidate: 30 },
            }
        );

        if (!response.ok) return null;

        const rawData: unknown = await response.json();

        const result = DiscordGuildDetailsSchema.safeParse(rawData);
        if (!result.success) {
            console.error("Invalid Discord Guild structure:", result.error);
            return null;
        }

        return result.data;
    } catch (error) {
        console.error("Failed to fetch guild details:", error);
        return null;
    }
}