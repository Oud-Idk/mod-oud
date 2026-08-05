import { LevelingFeature } from "@/features/leveling";

interface PageProps {
    params: Promise<{ guild_id: string }>
}

export default async function LevelingPage({ params }: PageProps) {
    const { guild_id } = await params;

    return <LevelingFeature guildId={guild_id}/>
}

