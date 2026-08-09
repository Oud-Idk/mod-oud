import { getRoleMap } from "@/features/_shared/channels";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { WarnsBody } from "@/features/warns/components/WarnsBody";
import { JSX } from "react";
import { getWarnThresholds } from "@/features/warns/queries";

interface WarnFeatureProps {
    guildId: string;
}

export async function WarnFeature({ guildId }: WarnFeatureProps): Promise<JSX.Element> {
    const [initialThresholds, roleMap] = await Promise.all([
        getWarnThresholds(guildId),
        getRoleMap(guildId),
    ]);

    return (
        <div>
            <DashboardHeader>Warns</DashboardHeader>
            <WarnsBody guildId={guildId} initialThresholds={initialThresholds} roleMap={roleMap}/>
        </div>
    );
}