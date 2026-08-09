import { MessageLoggingFeature } from "@/features/message-logging";
import { JSX} from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function MessageLoggingPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;

    return <MessageLoggingFeature guildId={guild_id} />;
}