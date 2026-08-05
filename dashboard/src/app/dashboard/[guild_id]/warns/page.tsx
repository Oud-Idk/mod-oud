import { WarnFeature } from "@/features/warns";
import { ReactNode } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function WarnsPage({ params }: PageProps): Promise<ReactNode> {
    const { guild_id } = await params;

    return <WarnFeature guildId={guild_id} />
}