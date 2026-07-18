import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { getInviteLeaderboard, getInviteTrackerConfig } from "@/utils/db/config";
import { saveInviteTrackerConfigAction } from "@/actions/inviteTracker";
import { InviteTrackingBody } from "@/components/Dashboards/InviteTracking/InviteTrackingBody";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function InviteTrackingPage({ params }: PageProps) {
    const { guild_id } = await params;

    const [inviteConfig, leaderboard] = await Promise.all([
        getInviteTrackerConfig(guild_id),
        getInviteLeaderboard(guild_id, 15),
    ]);

    const onSave = saveInviteTrackerConfigAction.bind(null, guild_id);

    return (
        <div className="h-full flex flex-col">
            <DashboardHeader>Invite Tracker</DashboardHeader>
            <InviteTrackingBody
                guildId={guild_id} initialConfig={inviteConfig} leaderboard={leaderboard} onSave={onSave}
            />
        </div>
    );
}