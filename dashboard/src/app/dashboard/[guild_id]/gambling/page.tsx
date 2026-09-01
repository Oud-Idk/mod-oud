import { GamblingFeature } from "@/features/gambling/components/GamblingFeature";
import { JSX } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function GamblingPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;
    return <GamblingFeature guildId={guild_id} />;
}
