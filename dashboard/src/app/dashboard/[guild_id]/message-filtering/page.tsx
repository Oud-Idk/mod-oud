import { MessageFilteringFeature } from "@/features/message-filtering";
import { JSX } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
    searchParams: Promise<{ id?: string }>;
}

export default async function MessageFilteringPage({ params, searchParams }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;
    const { id: rulesetId } = await searchParams;

    return <MessageFilteringFeature guildId={guild_id} rulesetId={rulesetId} />
}