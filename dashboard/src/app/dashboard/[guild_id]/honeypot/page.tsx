import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { getHoneypotConfig } from "@/utils/db/config";
import { HoneypotBody } from "@/components/Dashboards/Honeypot/HoneypotBody";
import { saveHoneypotConfigAction } from "@/actions/config";
import { getRoleMap, getTextChannelMap } from "@/utils/discord";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}


export default async function HoneypotPage({ params }: PageProps) {
    const { guild_id } = await params;
    const [textChannelMap, roleMap, settings] = await Promise.all([
        getTextChannelMap(guild_id),
        getRoleMap(guild_id),
        getHoneypotConfig(guild_id)],
    );
    const onSave = saveHoneypotConfigAction.bind(null, guild_id);

    return <div>
        <DashboardHeader className="mb-1">Honeypot Channel</DashboardHeader>

        <HoneypotBody
            honeypotConfig={settings}
            onSave={onSave}
            textChannelMap={textChannelMap}
            guildId={guild_id}
            roleMap={roleMap}
        />
    </div>
}