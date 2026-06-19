import { LeaveBody } from "@/components/Dashboards/Leave/LeaveBody";
import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { getGuildChannels } from "@/utils/discord";
import { getLeaveConfig } from "@/utils/db/config";
import { saveLeaveConfigAction } from "@/actions/config";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function LeavePage({ params }: PageProps) {
    const { guild_id } = await params;

    const [leaveConfig, channels] = await Promise.all([
        getLeaveConfig(guild_id),
        getGuildChannels(guild_id)
    ]);

    const onSave = saveLeaveConfigAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Leave Message</DashboardHeader>
            <div>
                <LeaveBody
                    leaveConfig={leaveConfig} channels={channels} onSave={onSave}
                />
            </div>
        </div>
    );
}