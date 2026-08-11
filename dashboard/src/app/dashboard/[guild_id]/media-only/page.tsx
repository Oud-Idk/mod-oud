import { MediaOnlyFeature } from "@/features/media-only";
import { JSX } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function MediaOnlyPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;
    return <MediaOnlyFeature guildId={guild_id} />;
}
