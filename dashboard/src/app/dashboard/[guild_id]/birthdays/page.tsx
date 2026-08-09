import { BirthdayFeature } from "@/features/birthdays";
import { JSX} from "react";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function BirthdaysPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;
    return <BirthdayFeature guildId={guild_id} />;
}