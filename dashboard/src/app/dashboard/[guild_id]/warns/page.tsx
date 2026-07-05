import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { WarnsBody } from "@/components/Dashboards/Warns/WarnsBody";
import { getWarnThresholds } from "@/actions/warns";
import { getRoleMap } from "@/utils/discord";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function WarnsPage({ params }: PageProps) {
    const { guild_id } = await params;

    const [initialThresholds, roleMap] = await Promise.all([
        getWarnThresholds(guild_id),
        getRoleMap(guild_id),
    ]);

    return (
        <div>
            <DashboardHeader>Warns</DashboardHeader>
            <WarnsBody guildId={guild_id} initialThresholds={initialThresholds} roleMap={roleMap}/>
        </div>
    );
}