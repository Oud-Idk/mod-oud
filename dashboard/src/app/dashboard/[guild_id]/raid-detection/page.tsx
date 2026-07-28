import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { getRaidDetectionConfig } from "@/utils/db/config";
import { RaidDetectionBody } from "@/components/Dashboards/RaidDetection/RaidDetectionBody";
import { saveRaidDetectionConfigAction } from "@/actions/config";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function RaidDetectionPage({ params }: PageProps) {
    const { guild_id } = await params;

    const raidDetectionConfig = await getRaidDetectionConfig(guild_id);

    const handleSave = saveRaidDetectionConfigAction.bind(null, guild_id);

    return (
        <div className="space-y-6">
            <DashboardHeader>Raid Detection</DashboardHeader>
            <RaidDetectionBody raidDetectionConfig={raidDetectionConfig} onSave={handleSave}/>
        </div>
    );
}