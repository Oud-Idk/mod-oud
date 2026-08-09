import { MemberCounterFeature } from "@/features/member-counter";
import { JSX} from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function MemberCounterPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;
    return <MemberCounterFeature guildId={guild_id} />;
}