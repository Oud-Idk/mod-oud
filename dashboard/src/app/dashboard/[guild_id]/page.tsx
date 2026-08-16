import { CircleArrowUp, Gavel, Ticket, TicketX, Users } from "lucide-react";
import { BotNotSetup } from "@/features/overview/components/BotNotSetup";
import Image from "next/image";
import { Card } from "@/features/overview/components/Card";

import { getGuildDetails, getGuildStats } from "@/features/overview/queries";
import { JSX } from "react";
import { ConnectionStatusPill } from "@/components/ui/ConnectionStatusPill";
import { Crab } from "@/features/overview/components/Crab";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

async function getBotProcessStatus(): Promise<boolean> {
    try {
        const response = await fetch(`${process.env.BOT_API ?? ""}/health`, {
            signal: AbortSignal.timeout(1000)
        });
        return response.ok;
    } catch {
        return false;
    }
}

export default async function DashboardOverviewPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;

    const [status, guildDetails, stats] = await Promise.all([
        getBotProcessStatus(),
        getGuildDetails(guild_id),
        getGuildStats(guild_id)
    ]);

    if (!guildDetails) {
        return <BotNotSetup permissions={process.env.PERMISSION ?? ""} guild_id={guild_id}/>;
    }

    const iconUrl = guildDetails.icon !== null
        ? `https://cdn.discordapp.com/icons/${guildDetails.id}/${guildDetails.icon}.png`
        : null;

    const { weeklyModerationCount, weeklyResolvedTicketCount, openTicketsCount } = stats;

    return (
        <div className="space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between">
                <div>
                    <div className="flex flex-row items-center gap-4">
                        {(iconUrl !== null) && (
                            <Image src={iconUrl} alt="Server Icon" width="50" height="50" className="rounded-full"/>
                        )}
                        <h1 className="text-3xl font-bold tracking-tight">{guildDetails.name}</h1>
                    </div>
                    <p className="text-muted-foreground">
                        Managing server ID <code>{guild_id}</code>
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <ConnectionStatusPill status={status ? "CONNECTED" : "DISCONNECTED"} connectedText="Online!" disconnectedText="Offline (Oud is too distracted with `The SpicyWolf` right now)"/>
                </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4">
                <Card
                    icon={<Users/>}
                    title="Total Members"
                    main={guildDetails.approximate_member_count?.toString() ?? "X"}
                    footer={`Online: ${guildDetails.approximate_presence_count?.toString() ?? "X"}`}
                />
                <Card
                    icon={<Gavel/>}
                    title="Moderation Actions Count"
                    main={weeklyModerationCount.toString()}
                    footer="This Week"
                />
                <Card
                    icon={<TicketX/>}
                    title="Resolved Tickets Count"
                    main={weeklyResolvedTicketCount.toString()}
                    footer="Lifetime"
                />
                <Card
                    icon={<Ticket/>} title="Open Tickets Count" main={openTicketsCount.toString()} footer="Now"
                />
                <Card
                    icon={<CircleArrowUp/>}
                    title="Features"
                    main="Blazingly Fast"
                />
                <Card icon={<Crab width={40}/>} title="Written In" main="Rust"/>
            </div>
        </div>
    );
}