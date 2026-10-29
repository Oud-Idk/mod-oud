import Image from "next/image";
import { config } from "@/config";
import { Users } from "lucide-react";
import { JSX } from "react";
import { ConnectionStatusPill } from "@/components/ui/ConnectionStatusPill";
import {
    ActiveRaidBanner,
    ActivityCharts,
    BotNotSetup,
    FeatureStatusMatrix,
    NeedsAttentionPanel,
    RecentIncidentsFeed,
    TelemetryCards,
    WeeklyStatCards,
    getActiveRaid,
    getAttentionItems,
    getGuildDetails,
    getGuildFeatureMatrix,
    getRecentIncidents,
    getTelemetry,
    getWeeklyStats,
} from "@/features/overview";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

async function getBotProcessStatus(): Promise<boolean> {
    try {
        const response = await fetch(`${config.backendInternalUrl}/health`, {
            signal: AbortSignal.timeout(1000),
        });
        return response.ok;
    } catch {
        return false;
    }
}

export default async function DashboardOverviewPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;

    const [status, guildDetails, telemetry, featureMatrix, incidents, activeRaid, attention, weeklyStats] = await Promise.all([
        getBotProcessStatus(),
        getGuildDetails(guild_id),
        getTelemetry(),
        getGuildFeatureMatrix(guild_id),
        getRecentIncidents(guild_id, 6),
        getActiveRaid(guild_id),
        getAttentionItems(guild_id),
        getWeeklyStats(guild_id),
    ]);

    if (!guildDetails) {
        return <BotNotSetup permissions={process.env.PERMISSION ?? ""} guild_id={guild_id} />;
    }

    const iconUrl = guildDetails.icon !== null
        ? `https://cdn.discordapp.com/icons/${guildDetails.id}/${guildDetails.icon}.png`
        : null;

    const memberCount = guildDetails.approximate_member_count !== undefined
        ? guildDetails.approximate_member_count.toLocaleString()
        : null;

    const onlineCount = guildDetails.approximate_presence_count !== undefined
        ? guildDetails.approximate_presence_count.toLocaleString()
        : null;

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    {iconUrl !== null && (
                        <Image
                            src={iconUrl}
                            alt="Server Icon"
                            width={56}
                            height={56}
                            className="rounded-2xl border border-border shrink-0 shadow-sm"
                        />
                    )}
                    <div>
                        <div className="flex flex-wrap items-center gap-4">
                            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                                {guildDetails.name}
                            </h1>
                            {memberCount !== null && (
                                <span className="inline-flex items-center gap-2">
                                    <Users className="w-3.5 h-3.5 text-muted-foreground" />
                                    <span>{memberCount} members</span>
                                    {onlineCount !== null && (
                                        <span className="text-muted-foreground font-normal">
                                            ({onlineCount} online)
                                        </span>
                                    )}
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                            Server ID: <code className="font-mono text-[11px]">{guild_id}</code>
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                    <ConnectionStatusPill
                        status={status ? "CONNECTED" : "DISCONNECTED"}
                        connectedText="Bot Online"
                        disconnectedText="Bot Offline"
                    />
                </div>
            </div>

            <ActiveRaidBanner raid={activeRaid} guildId={guild_id} />

            <NeedsAttentionPanel items={attention} />

            <WeeklyStatCards stats={weeklyStats} />

            <RecentIncidentsFeed incidents={incidents} guildId={guild_id} />

            <TelemetryCards telemetry={telemetry} />

            <FeatureStatusMatrix categories={featureMatrix} />

            <ActivityCharts guildId={guild_id} />
        </div>
    );
}
