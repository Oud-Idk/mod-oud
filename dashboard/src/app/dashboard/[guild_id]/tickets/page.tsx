import { TicketsFeature } from "@/features/tickets";
import { JSX } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function TicketsPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;

    return <TicketsFeature guildId={guild_id} />
}

