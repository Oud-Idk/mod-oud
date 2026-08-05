import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { getRoleMap, getTextChannelMap } from "@/features/_shared/channels";
import { getBirthdayConfig } from "../queries";
import { saveBirthdayConfigAction } from "../actions";
import { BirthdaysBody } from "./BirthdaysBody";
import { ReactNode } from "react";

interface BirthdayFeatureProps {
    guildId: string;
}

export async function BirthdayFeature({ guildId }: BirthdayFeatureProps): Promise<ReactNode> {
    const [config, channelMap, roleMap] = await Promise.all([
        getBirthdayConfig(guildId),
        getTextChannelMap(guildId),
        getRoleMap(guildId),
    ]);

    const onSave = saveBirthdayConfigAction.bind(null, guildId);

    return (
        <div>
            <DashboardHeader>Birthdays Plugin</DashboardHeader>
            <BirthdaysBody
                initialConfig={config}
                guildId={guildId}
                onSave={onSave}
                channelMap={channelMap}
                roleMap={roleMap}
            />
        </div>
    );
}