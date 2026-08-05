import { RemindersFeature } from "@/features/reminders";
import { ReactNode } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
    searchParams: Promise<{ id?: string }>;
}

export default async function RemindersPage({ params, searchParams }: PageProps): Promise<ReactNode> {
    const { guild_id } = await params;
    const { id: reminderId } = await searchParams;

    return <RemindersFeature guildId={guild_id} activeReminderId={reminderId} />;
}