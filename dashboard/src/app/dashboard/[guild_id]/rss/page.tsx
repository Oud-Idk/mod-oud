import { RssFeature } from "@/features/rss";
import { JSX } from "react";

interface RssPageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function RssPage({ params }: RssPageProps): Promise<JSX.Element> {
    const { guild_id } = await params;

    return <RssFeature guildId={guild_id} />;
}
