import { ReactNode } from "react";
import { TempVoiceFeature } from "@/features/temp-voice";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function TempVoicePage({ params }: PageProps): Promise<ReactNode> {
    const { guild_id } = await params;

    return <TempVoiceFeature guildId={guild_id} />
}

