import { LevelingFeature } from "@/features/leveling";
import { JSX } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>
}

export default async function LevelingPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;

    return <LevelingFeature guildId={guild_id}/>
}

