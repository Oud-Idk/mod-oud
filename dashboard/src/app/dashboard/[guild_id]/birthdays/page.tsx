import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { BirthdaysBody } from "@/components/Dashboards/Birthdays/BirthdaysBody";
import { getBirthdayConfig } from "@/utils/db/birthdays";
import { getRoleMap, getTextChannelMap } from "@/utils/discord";
import { saveBirthdayConfigAction } from "@/actions/config";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function BirthdaysPage({ params }: PageProps) {
    const { guild_id } = await params;

    const [config, channelMap, roleMap] = await Promise.all([
        getBirthdayConfig(guild_id),
        getTextChannelMap(guild_id),
        getRoleMap(guild_id),
    ]);

    const onSave = saveBirthdayConfigAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Birthdays Plugin</DashboardHeader>
            <BirthdaysBody
                initialConfig={config} guildId={guild_id} onSave={onSave} channelMap={channelMap} roleMap={roleMap}
            />
        </div>
    );
}