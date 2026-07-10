import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { TempVoiceBody } from "@/components/Dashboards/TempVoice/TempVoiceBody";
import { getCategoryMap, getTextChannelMap, getVoiceChannelMap } from "@/utils/discord";
import { getTempVoiceHubs } from "@/actions/tempVoice";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function TempVoicePage({ params }: PageProps) {
    const { guild_id } = await params;

    const [hubs, voiceChannelMap, categoryMap, textChannelMap] = await Promise.all([
        getTempVoiceHubs(guild_id),
        getVoiceChannelMap(guild_id),
        getCategoryMap(guild_id),
        getTextChannelMap(guild_id),
    ]);

    return (
        <div>
            <DashboardHeader>Temporary Voice Channel</DashboardHeader>
            <TempVoiceBody
                initialHubs={hubs}
                voiceChannelMap={voiceChannelMap}
                categoryMap={categoryMap}
                guildId={guild_id}
                textChannelMap={textChannelMap}
            />
        </div>
    );
}