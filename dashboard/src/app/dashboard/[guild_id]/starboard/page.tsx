import { StarboardFeature } from "@/features/starboard/components/StarboardFeature";
import { ReactNode } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
    searchParams: Promise<{ id?: string }>;
}

export default async function StarboardPage({ params, searchParams }: PageProps): Promise<ReactNode> {
    const { guild_id } = await params;
    const { id } = await searchParams;

    return <StarboardFeature guildId={guild_id} activeConfigId={id} />;
}