import React, { JSX} from "react";
import { HoneypotFeature } from "@/features/honeypot";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function HoneypotPage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;
    return <HoneypotFeature guildId={guild_id} />;
}