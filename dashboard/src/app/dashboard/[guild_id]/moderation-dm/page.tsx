import { JSX} from "react";
import { ModerationDMsFeature } from "@/features/moderation-dms";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function LogPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;
    return <ModerationDMsFeature guildId={guild_id}/>;
}