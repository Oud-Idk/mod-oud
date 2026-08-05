import { RaidDetectionFeature } from "@/features/raid-detection";
import { ReactNode } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function RaidDetectionPage({ params }: PageProps): Promise<ReactNode> {
    const { guild_id } = await params;
    return <RaidDetectionFeature guildId={guild_id} />;
}