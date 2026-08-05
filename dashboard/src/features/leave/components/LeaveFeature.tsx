import { ReactNode } from "react";
import { getGuildChannels } from "@/features/_shared/channels";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { LeaveBody } from "@/features/leave/components/LeaveBody";
import { getLeaveConfig } from "@/features/leave/queries";
import { saveLeaveConfigAction } from "@/features/leave/actions";

interface LeaveFeatureProps {
    guildId: string;
}

export async function LeaveFeature({ guildId }: LeaveFeatureProps): Promise<ReactNode> {
    const [leaveConfig, channels] = await Promise.all([
        getLeaveConfig(guildId),
        getGuildChannels(guildId)
    ]);

    const onSave = saveLeaveConfigAction.bind(null, guildId);

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