import { ReactNode } from "react";
import { EmbedBuilderFeature } from "@/features/embed-builder";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function EmbedBuilderPage({ params }: PageProps): Promise<ReactNode> {
    const { guild_id } = await params;

    return <EmbedBuilderFeature guildId={guild_id} />
}


