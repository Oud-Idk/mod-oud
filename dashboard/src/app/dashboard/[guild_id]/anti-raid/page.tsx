import { RaidDetectionFeature } from "@/features/raid-detection";
import { JSX} from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function RaidDetectionPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;
    return <RaidDetectionFeature guildId={guild_id} />;
}