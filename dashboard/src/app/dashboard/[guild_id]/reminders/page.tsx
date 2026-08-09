import { RemindersFeature } from "@/features/reminders";
import { JSX} from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
    searchParams: Promise<{ id?: string }>;
}

export default async function RemindersPage({ params, searchParams }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;
    const { id: reminderId } = await searchParams;

    return <RemindersFeature guildId={guild_id} activeReminderId={reminderId} />;
}