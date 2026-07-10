import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { EmbedBuilderBody } from "@/components/Dashboards/EmbedBuilder/EmbedBuilderBody";
import { getTextChannelMap } from "@/utils/discord";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function EmbedBuilderPage({ params }: PageProps) {
    const { guild_id } = await params;
    const channelMap = await getTextChannelMap(guild_id);

    return <div>
        <DashboardHeader className="mb-2">Embed Builder</DashboardHeader>
        <p>Send custom embed message here!</p>
        <EmbedBuilderBody
            channelMap={channelMap} guildId={guild_id}
        />
    </div>
}