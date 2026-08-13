import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { auth } from "@/lib/auth";
import { JSX } from "react";
import { MusicStatsBody } from "@/features/music-stats/components/MusicStatsBody";
import { MusicControlPanel } from "@/features/music-stats/components/MusicControlPanel";
import { getVoiceChannelMap } from "@/features/_shared/channels";
import {
    getMusicStatsSummary,
    getTopListeners,
    getTopTracks,
} from "@/features/music-stats/queries";

interface MusicStatsFeatureProps {
    guildId: string;
}

export async function MusicStatsFeature({ guildId }: MusicStatsFeatureProps): Promise<JSX.Element> {
    const [summary, topTracks, topListeners, session, voiceChannelMap] = await Promise.all([
        getMusicStatsSummary(guildId),
        getTopTracks(guildId),
        getTopListeners(guildId),
        auth(),
        getVoiceChannelMap(guildId),
    ]);

    return (
        <div className="h-full flex flex-col gap-4">
            <DashboardHeader>Music</DashboardHeader>
            <MusicControlPanel
                guildId={guildId}
                requestedById={session?.user.id ?? undefined}
                voiceChannelMap={voiceChannelMap}
            />
            <MusicStatsBody
                summary={summary}
                topTracks={topTracks}
                topListeners={topListeners}
            />
        </div>
    );
}
