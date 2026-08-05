import { BirthdayFeature } from "@/features/birthdays";
import { ReactNode } from "react";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function BirthdaysPage({ params }: PageProps): Promise<ReactNode> {
    const { guild_id } = await params;
    return <BirthdayFeature guildId={guild_id} />;
}