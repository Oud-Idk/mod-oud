import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { JSX } from "react";
import { MusicStatsBody } from "@/features/music-stats/components/MusicStatsBody";
import {
    getMusicStatsSummary,
    getTopListeners,
    getTopTracks,
} from "@/features/music-stats/queries";

interface MusicStatsFeatureProps {
    guildId: string;
}

export async function MusicStatsFeature({ guildId }: MusicStatsFeatureProps): Promise<JSX.Element> {
    const [summary, topTracks, topListeners] = await Promise.all([
        getMusicStatsSummary(guildId),
        getTopTracks(guildId),
        getTopListeners(guildId),
    ]);

    return (
        <div className="h-full flex flex-col gap-4">
            <DashboardHeader>Music Stats</DashboardHeader>
            <MusicStatsBody
                summary={summary}
                topTracks={topTracks}
                topListeners={topListeners}
            />
        </div>
    );
}
