import { TicketsFeature } from "@/features/tickets";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function TicketsPage({ params }: PageProps) {
    const { guild_id } = await params;

    return <TicketsFeature guildId={guild_id} />
}

