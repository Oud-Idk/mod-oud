import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { getTextChannelMap } from "@/features/_shared/channels";
import { getRaidDetectionConfig, getRaidStatus } from "../queries";
import { saveRaidDetectionConfigAction } from "../actions";
import { RaidDetectionBody } from "./RaidDetectionBody";
import { JSX} from "react";
import { getWelcomeConfig } from "@/features/welcome/queries";

interface RaidDetectionFeatureProps {
    guildId: string;
}

export async function RaidDetectionFeature({ guildId }: RaidDetectionFeatureProps): Promise<JSX.Element> {
    const [raidDetectionConfig, welcomeConfig, channelMap] = await Promise.all([
        getRaidDetectionConfig(guildId),
        getWelcomeConfig(guildId),
        getTextChannelMap(guildId),
    ]);

    const raidStatus = await getRaidStatus(
        guildId,
        raidDetectionConfig.windowSizeSeconds,
        raidDetectionConfig.minSafeLimit
    );

    const handleSave = saveRaidDetectionConfigAction.bind(null, guildId);

    return (
        <div>
            <DashboardHeader>Raid Detection</DashboardHeader>
            <RaidDetectionBody
                raidDetectionConfig={raidDetectionConfig}
                welcomeConfig={welcomeConfig}
                onSave={handleSave}
                raidStatus={raidStatus}
                channelMap={channelMap}
            />
        </div>
    );
}