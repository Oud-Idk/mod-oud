import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { getRaidDetectionConfig, getWelcomeConfig } from "@/utils/db/config";
import { RaidDetectionBody } from "@/components/Dashboards/RaidDetection/RaidDetectionBody";
import { saveRaidDetectionConfigAction } from "@/actions/config";
import { getTextChannelMap } from "@/utils/discord";
import { getRaidStatus } from "@/actions/raidDetection";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function RaidDetectionPage({ params }: PageProps) {
    const { guild_id } = await params;

    const [raidDetectionConfig, welcomeConfig, channelMap] = await Promise.all([
        getRaidDetectionConfig(guild_id), getWelcomeConfig(guild_id), getTextChannelMap(guild_id),
    ]);

    const raidStatus = await getRaidStatus(guild_id, raidDetectionConfig.windowSizeSeconds, raidDetectionConfig.minSafeLimit);

    const handleSave = saveRaidDetectionConfigAction.bind(null, guild_id);

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