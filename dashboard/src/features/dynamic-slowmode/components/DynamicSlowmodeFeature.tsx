import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { getSlowmodeChannelMap } from "@/features/_shared/channels";
import { getDynamicSlowmodeConfig, getSlowmodeStatus } from "../queries";
import { saveDynamicSlowmodeConfigAction } from "../actions";
import { DynamicSlowmodeBody } from "./DynamicSlowmodeBody";
import { JSX } from "react";

interface DynamicSlowmodeFeatureProps {
    guildId: string;
}

export async function DynamicSlowmodeFeature({
    guildId,
}: DynamicSlowmodeFeatureProps): Promise<JSX.Element> {
    const [config, channelMap] = await Promise.all([
        getDynamicSlowmodeConfig(guildId),
        getSlowmodeChannelMap(guildId),
    ]);

    // The status endpoint needs the bot, so a stopped bot must not take the whole page down.
    const status = await getSlowmodeStatus(guildId).catch((error: unknown) => {
        console.error("Failed to read dynamic slowmode status:", error);
        return { config, channels: [] };
    });

    const handleSave = saveDynamicSlowmodeConfigAction.bind(null, guildId);

    return (
        <div>
            <DashboardHeader>Dynamic Slowmode</DashboardHeader>
            <DynamicSlowmodeBody
                config={config}
                status={status}
                channelMap={channelMap}
                onSave={handleSave}
            />
        </div>
    );
}
