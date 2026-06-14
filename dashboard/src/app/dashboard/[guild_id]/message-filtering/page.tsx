import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { MessageFilteringBody } from "@/components/Dashboards/MessageFiltering/MessageFilteringBody";
import { getChannelMap, getRoleMap } from "@/utils/discord";
import { getMessageFilteringConfig } from "@/utils/db/config";
import { saveMessageFilteringConfigAction } from "@/actions/config";

interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function MessageFilteringPage({ params }: PageProps) {
    const { guild_id } = await params;

    const [
        messageFilteringConfig,
        channelMap,
        roleMap,
    ] = await Promise.all([
        getMessageFilteringConfig(guild_id),
        getChannelMap(guild_id),
        getRoleMap(guild_id),
    ]);

    // Binds guild_id so the onSave callback signature is simple for the client component
    const onSave = saveMessageFilteringConfigAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Message Filtering</DashboardHeader>
            <MessageFilteringBody
                messageFilteringConfig={messageFilteringConfig}
                channelMap={channelMap}
                roleMap={roleMap}
                onSave={onSave}
                guildId={guild_id}
            />
        </div>
    );
}