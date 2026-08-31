import { EconomyFeature } from "@/features/economy";
import { JSX } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function EconomyPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;

    return <EconomyFeature guildId={guild_id} />;
}