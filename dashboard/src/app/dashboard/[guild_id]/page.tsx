import { Gavel, Ticket, TicketX, Users } from "lucide-react";
import { BotNotSetup } from "@/components/Dashboards/General/BotNotSetup";
import Image from "next/image";
import { Card } from "@/components/Overview/Card";
import { getGuildDetails } from "@/utils/discord";
import { getGuildStats } from "@/utils/db/guild";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

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

export default async function DashboardOverviewPage({ params }: PageProps) {
    const { guild_id } = await params;

    const [status, guildDetails, stats] = await Promise.all([
        getBotProcessStatus(),
        getGuildDetails(guild_id),
        getGuildStats(guild_id)
    ]);

    if (!guildDetails) {
        return <BotNotSetup permissions={process.env.PERMISSION || ""} guild_id={guild_id}/>;
    }

    const iconUrl = guildDetails.icon
        ? `https://cdn.discordapp.com/icons/${guildDetails.id}/${guildDetails.icon}.png`
        : null;

    const { weeklyModerationCount, weeklyResolvedTicketCount, openTicketsCount } = stats;

    return (
        <div className="space-y-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-4">
                <div>
                    <div className="flex flex-row items-center gap-4">
                        {iconUrl && (
                            <Image src={iconUrl} alt="Server Icon" width="50" height="50" className="rounded-full"/>
                        )}
                        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
                    </div>
                    <p className="text-neutral-500 dark:text-neutral-400 mt-1">
                        Managing server ID:{" "}
                        <code className="bg-neutral-200 dark:bg-neutral-800 px-1.5 py-0.5 rounded text-sm font-mono">
                            {guild_id}
                        </code>
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
                            className={`w-2 h-2 rounded-full ${status ? "bg-emerald-500 animate-pulse" : "bg-red-500"}`}/>
                        {status ? "Online" : "Offline (Oud (the only programmer) is an Idiot)"}
                    </span>
                </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
                <Card
                    icon={<Users/>}
                    title="Total Members"
                    main={guildDetails.approximate_member_count?.toString() || "X"}
                    footer={`Online: ${guildDetails.approximate_presence_count}`}
                />
                <Card
                    icon={<Gavel/>}
                    title="Moderation Actions Count"
                    main={weeklyModerationCount?.toString() || "X"}
                    footer="This Week"
                />
                <Card
                    icon={<TicketX/>}
                    title="Resolved Tickets Count"
                    main={weeklyResolvedTicketCount?.toString() || "X"}
                    footer="Lifetime"
                />
                <Card
                    icon={<Ticket/>} title="Open Tickets Count" main={openTicketsCount?.toString() || "X"} footer="Now"
                />
            </div>
        </div>
    );
}