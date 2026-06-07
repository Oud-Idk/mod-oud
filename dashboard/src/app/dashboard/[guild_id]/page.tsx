import { Gavel, Ticket, TicketX, Users } from "lucide-react";
import { BotNotSetup } from "@/components/Dashboard/BotNotSetup";
import Image from "next/image";
import { db } from "@/lib/db";
import { DiscordGuildDetails } from "@/types";
import { Card } from "@/components/Overview/Card";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

interface GuildStats {
    weeklyModerationCount: number;
    weeklyResolvedTicketCount: number;
    openTicketsCount: number;
}

export async function getGuildDetails(guildId: string): Promise<DiscordGuildDetails | null> {
    const botToken = process.env.DISCORD_TOKEN;
    if (!botToken) return null;

    try {
        const response = await fetch(
            `https://discord.com/api/v10/guilds/${guildId}?with_counts=true`,
            {
                headers: {
                    Authorization: `Bot ${botToken}`,
                },
                next: { revalidate: 30 },
            }
        );

        if (!response.ok) {
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error("Failed to fetch guild details:", error);
        return null;
    }
}

async function getGuildStats(guildId: string): Promise<GuildStats> {
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
                      AND guild_id = $1)                   AS weekly_moderation,
                   (SELECT COUNT(*)
                    FROM tickets
                    WHERE guild_id = $1
                      AND status = 'CLOSE'::ticket_status) AS weekly_resolved,
                   (SELECT COUNT(*)
                    FROM tickets
                    WHERE guild_id = $1
                      AND status = 'OPEN'::ticket_status)  AS open_tickets;
        `;

        const result = await db.query(query, [guildId]);
        const row = result.rows[0];

        if (!row) {
            return defaultStats;
        }

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

export default async function DashboardOverview({ params }: PageProps) {
    const { guild_id } = await params;

    async function getBotProcessStatus(): Promise<boolean> {
        try {
            const response = await fetch(`${process.env.BOT_API || ""}/health`, {
                signal: AbortSignal.timeout(1000)
            });
            return response.ok;
        } catch {
            return false;
        }
    }

    const status = await getBotProcessStatus();
    const guildDetails = await getGuildDetails(guild_id);

    if (!guildDetails) {
        return <BotNotSetup permissions={process.env.PERMISSION || ""} guild_id={guild_id}/>;
    }

    const iconUrl = guildDetails.icon
        ? `https://cdn.discordapp.com/icons/${guildDetails.id}/${guildDetails.icon}.png`
        : null;

    const { weeklyModerationCount, weeklyResolvedTicketCount, openTicketsCount } = await getGuildStats(guild_id);

    return (
        <div
            className="space-y-8"
        >
            <div
                className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
                <div>
                    <div className="flex flex-row items-center gap-4">
                        {iconUrl &&
                            <Image src={iconUrl} alt="Server Icon" width="50" height="50" className="rounded-full"/>}
                        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
                    </div>
                    <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                        Managing server ID: <code
                        className="bg-neutral-200 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-sm font-mono">{guild_id}</code>
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <span
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                            status
                                ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-400 border-emerald-200 dark:border-emerald-900"
                                : "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-400 border-red-200 dark:border-red-900"
                        }`}
                    >
                        <span
                            className={`w-2 h-2 rounded-full ${
                                status ? "bg-emerald-500 animate-pulse" : "bg-red-500"
                            }`}
                        ></span>
                        {status ? "Online" : "Offline (Oud is an Idiot)"}
                    </span>
                </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
                <Card icon={<Users/>} title="Total Members"
                      main={guildDetails.approximate_member_count?.toString() || "X"}
                      footer={`Online: ${guildDetails.approximate_presence_count}`}/>
                <Card icon={<Gavel/>} title="Moderation Actions Count"
                      main={weeklyModerationCount?.toString() || "X"}
                      footer="This Week"/>
                <Card icon={<TicketX/>} title="Resolved Tickets Count"
                      main={weeklyResolvedTicketCount?.toString() || "X"}
                      footer="Lifetime"/>
                <Card icon={<Ticket/>} title="Open Tickets Count"
                      main={openTicketsCount?.toString() || "X"}
                      footer="Now"/>
            </div>
        </div>
    );
}