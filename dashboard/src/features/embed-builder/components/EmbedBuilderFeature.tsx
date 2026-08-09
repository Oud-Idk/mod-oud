import { JSX } from "react";
import { getTextChannelMap } from "@/features/_shared/channels";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { EmbedBuilderBody } from "@/features/embed-builder/components/EmbedBuilderBody";

interface EmbedBuilderFeatureProps {
    guildId: string;
}

export async function EmbedBuilderFeature({ guildId }: EmbedBuilderFeatureProps): Promise<JSX.Element> {
    const channelMap = await getTextChannelMap(guildId);

    return <div>
        <DashboardHeader className="mb-2">Embed Builder</DashboardHeader>
        <p>Send custom embed message here!</p>
        <EmbedBuilderBody
            channelMap={channelMap} guildId={guildId}
        />
    </div>
}