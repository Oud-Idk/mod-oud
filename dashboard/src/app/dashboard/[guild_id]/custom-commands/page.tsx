import { CustomCommandsFeature } from "@/features/custom-commands";
import { ReactNode } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
    searchParams: Promise<{ id?: string }>;
}

export default async function CustomCommandsPage({ params, searchParams }: PageProps): Promise<ReactNode> {
    const { guild_id } = await params;
    const { id: activeId } = await searchParams;

    return <CustomCommandsFeature guildId={guild_id} activeId={activeId} />;
}