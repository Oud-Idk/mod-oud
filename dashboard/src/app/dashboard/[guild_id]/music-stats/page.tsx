import { MusicStatsFeature } from "@/features/music-stats";
import { JSX } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function MusicStatsPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;

    return <MusicStatsFeature guildId={guild_id} />;
}
