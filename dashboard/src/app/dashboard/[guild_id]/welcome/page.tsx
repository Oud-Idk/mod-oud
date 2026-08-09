import { WelcomeFeature } from "@/features/welcome";
import { JSX} from "react";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function WelcomePage({ params }: PageProps): Promise<JSX.Element> {
    const { guild_id } = await params;

    return <WelcomeFeature guildId={guild_id} />;
}