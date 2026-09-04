import { VerificationConfigFeature } from "@/features/verification";
import { JSX } from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function VerificationPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;

    return <VerificationConfigFeature guildId={guild_id} />;
}
