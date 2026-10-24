import { DynamicSlowmodeFeature } from "@/features/dynamic-slowmode";
import { JSX } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function DynamicSlowmodePage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;
    return <DynamicSlowmodeFeature guildId={guild_id} />;
}
