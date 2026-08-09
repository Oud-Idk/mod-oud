import { WarnFeature } from "@/features/warns";
import { JSX} from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function WarnsPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;

    return <WarnFeature guildId={guild_id} />
}