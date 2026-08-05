import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { getRoleMap } from "@/features/_shared/channels";
import { getMemberCounterConfig } from "../queries";
import { saveMemberCounterConfigAction } from "../actions";
import { MemberCounterBody } from "./MemberCounterBody";
import { ReactNode } from "react";

interface MemberCounterFeatureProps {
    guildId: string;
}

export async function MemberCounterFeature({ guildId }: MemberCounterFeatureProps): Promise<ReactNode> {
    const [memberCounterConfig, roleMap] = await Promise.all([
        getMemberCounterConfig(guildId),
        getRoleMap(guildId),
    ]);

    const onSave = saveMemberCounterConfigAction.bind(null, guildId);

    return (
        <div className="space-y-6">
            <DashboardHeader>Member Counter</DashboardHeader>
            <MemberCounterBody
                guildId={guildId}
                memberCounterConfig={memberCounterConfig}
                onSave={onSave}
                roleMap={roleMap}
            />
        </div>
    );
}