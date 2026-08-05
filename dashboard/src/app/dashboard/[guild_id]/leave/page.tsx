import { ReactNode } from "react";
import { LeaveFeature } from "@/features/leave";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function LeavePage({ params }: PageProps): Promise<ReactNode> {
    const { guild_id } = await params;

    return <LeaveFeature guildId={guild_id} />
}

