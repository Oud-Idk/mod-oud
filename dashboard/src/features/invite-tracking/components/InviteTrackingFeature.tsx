import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { InviteTrackingBody } from "@/features/invite-tracking/components/InviteTrackingBody";
import { ReactNode } from "react";
import { saveInviteTrackerConfigAction } from "@/features/invite-tracking/actions";
import { getInviteLeaderboard, getInviteTrackerConfig } from "@/features/invite-tracking/queries";

interface InviteTrackingFeatureProps {
    guildId: string;
}

const PAGE_SIZE = 15;

export async function InviteTrackingFeature({ guildId }: InviteTrackingFeatureProps): Promise<ReactNode> {
    const [inviteConfig, initialLeaderboard] = await Promise.all([
        getInviteTrackerConfig(guildId),
        getInviteLeaderboard(guildId, PAGE_SIZE, 0),
    ]);

    const onSave = saveInviteTrackerConfigAction.bind(null, guildId);

    return (
        <div className="h-full flex flex-col">
            <DashboardHeader>Invite Tracker</DashboardHeader>
            <InviteTrackingBody
                guildId={guildId}
                initialConfig={inviteConfig}
                initialLeaderboard={initialLeaderboard}
                pageSize={PAGE_SIZE}
                onSave={onSave}
            />
        </div>
    );
}