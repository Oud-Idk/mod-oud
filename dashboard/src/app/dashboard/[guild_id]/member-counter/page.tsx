import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { getMemberCountereConfig } from "@/utils/db/config";
import { MemberCounterBody } from "@/components/Dashboards/MemberTracking/MemberTrackingBody";
import { saveMemberCounterConfigAction } from "@/actions/config";
import { getRoleMap } from "@/utils/discord";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function MemberCounterPage({ params }: PageProps) {
    const { guild_id } = await params;

    const [
        memberCounterConfig,
        roleMap,
    ] = await Promise.all([
        getMemberCountereConfig(guild_id),
        getRoleMap(guild_id),
    ]);

    const onSave = saveMemberCounterConfigAction.bind(null, guild_id);

    return (
        <div className="space-y-6">
            <DashboardHeader>Member Counter</DashboardHeader>
            <MemberCounterBody
                guildId={guild_id} memberCounterConfig={memberCounterConfig} onSave={onSave} roleMap={roleMap}
            />
        </div>
    );
}