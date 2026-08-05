import { MemberCounterFeature } from "@/features/member-counter";
import { ReactNode } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function MemberCounterPage({ params }: PageProps): Promise<ReactNode> {
    const { guild_id } = await params;
    return <MemberCounterFeature guildId={guild_id} />;
}