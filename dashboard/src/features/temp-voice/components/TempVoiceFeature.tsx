import { JSX } from "react";
import { getCategoryMap, getTextChannelMap, getVoiceChannelMap } from "@/features/_shared/channels";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { TempVoiceBody } from "@/features/temp-voice/components/TempVoiceBody";
import { getTempVoiceHubs } from "@/features/temp-voice/queries";

interface TempVoiceFeatureProps {
    guildId: string;
}

export async function TempVoiceFeature({ guildId }: TempVoiceFeatureProps): Promise<JSX.Element> {
    const [hubs, voiceChannelMap, categoryMap, textChannelMap] = await Promise.all([
        getTempVoiceHubs(guildId),
        getVoiceChannelMap(guildId),
        getCategoryMap(guildId),
        getTextChannelMap(guildId),
    ]);

    return (
        <div>
            <DashboardHeader>Temporary Voice Channel</DashboardHeader>
            <TempVoiceBody
                initialHubs={hubs}
                voiceChannelMap={voiceChannelMap}
                categoryMap={categoryMap}
                guildId={guildId}
                textChannelMap={textChannelMap}
            />
        </div>
    );
}