import { ReactNode } from "react";
import { GiveawayFeature } from "@/features/giveaway";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
    searchParams: Promise<{ id?: string }>;
}

export default async function GiveawayPage({ params, searchParams }: PageProps): Promise<ReactNode> {
    const { guild_id } = await params;
    const { id: activeId } = await searchParams;

    return <GiveawayFeature guildId={guild_id} activeId={activeId} />
}
