import { JSX} from "react";
import { InviteTrackingFeature } from "@/features/invite-tracking";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function InviteTrackingPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;

    return <InviteTrackingFeature guildId={guild_id} />
}

