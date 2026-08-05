import { MessageLoggingFeature } from "@/features/message-logging";
import { ReactNode } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function MessageLoggingPage({ params }: PageProps): Promise<ReactNode> {
    const { guild_id } = await params;

    return <MessageLoggingFeature guildId={guild_id} />;
}