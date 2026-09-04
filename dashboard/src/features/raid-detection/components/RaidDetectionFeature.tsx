import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { getTextChannelMap } from "@/features/_shared/channels";
import { getRaidDetectionConfig, getRaidStatus } from "../queries";
import { saveRaidDetectionConfigAction } from "../actions";
import { RaidDetectionBody } from "./RaidDetectionBody";
import { JSX} from "react";
import { getVerificationConfig } from "@/features/verification";

interface RaidDetectionFeatureProps {
    guildId: string;
}

export async function RaidDetectionFeature({ guildId }: RaidDetectionFeatureProps): Promise<JSX.Element> {
    const [raidDetectionConfig, verificationConfig, channelMap] = await Promise.all([
        getRaidDetectionConfig(guildId),
        getVerificationConfig(guildId),
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
            <DashboardHeader>Anti-Raid</DashboardHeader>
            <RaidDetectionBody
                raidDetectionConfig={raidDetectionConfig}
                verificationConfig={verificationConfig}
                onSave={handleSave}
                raidStatus={raidStatus}
                channelMap={channelMap}
            />
        </div>
    );
}
