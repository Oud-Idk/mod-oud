import { LogsFeature } from "@/features/logs";
import { ReactNode } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function LogPage({ params }: PageProps): Promise<ReactNode> {
    const { guild_id } = await params;
    return <LogsFeature guildId={guild_id} />;
}