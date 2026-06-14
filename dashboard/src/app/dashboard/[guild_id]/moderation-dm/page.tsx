import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { ModerationDMsBody } from "@/components/Dashboards/ModerationDMs/ModerationDMsBody";
import { getModerationDMsConfig } from "@/utils/db/config";
import { saveModerationDMsConfigAction } from "@/actions/config"; // Adjust import path if needed

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function ModerationDMsPage({ params }: PageProps) {
    const { guild_id } = await params;

    const moderationDMsConfig = await getModerationDMsConfig(guild_id);

    const handleSave = saveModerationDMsConfigAction.bind(null, guild_id);

    return (
        <div className="space-y-6">
            <DashboardHeader>Moderation DM</DashboardHeader>
            <ModerationDMsBody
                moderationDMsConfig={moderationDMsConfig} onSave={handleSave}
            />
        </div>
    );
}