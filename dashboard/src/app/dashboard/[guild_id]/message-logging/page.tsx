import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { MessageLoggingBody } from "@/components/Dashboards/MessageLogging/MessageLoggingBody";
import { getChannelMap, getRoleMap } from "@/utils/discord";
import { getMessageLoggingConfig } from "@/utils/db/config";
import { getDeletedMessagesHistory, getEditedMessagesHistory } from "@/utils/db/messages";
import {
    fetchMoreDeletedMessagesAction,
    fetchMoreEditedMessagesAction,
    saveMessageLoggingConfigAction
} from "@/actions/messageLogging";

interface PageProps {
    params: Promise<{ guild_id: string }>
}

export default async function MessageLoggingPage({ params }: PageProps) {
    const { guild_id } = await params;

    const [
        messageLoggingConfig,
        deletedMessagesHistory,
        updatedMessageHistory,
        channelMap,
        roleMap,
    ] = await Promise.all([
        getMessageLoggingConfig(guild_id),
        getDeletedMessagesHistory(guild_id),
        getEditedMessagesHistory(guild_id),
        getChannelMap(guild_id),
        getRoleMap(guild_id),
    ]);

    const onSave = saveMessageLoggingConfigAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Message Logging</DashboardHeader>
            <MessageLoggingBody
                messageLoggingConfig={messageLoggingConfig}
                deletedMessagesHistory={deletedMessagesHistory}
                editedMessagesHistory={updatedMessageHistory}
                channelMap={channelMap}
                roleMap={roleMap}
                onSave={onSave}
                fetchMoreDeletedAction={fetchMoreDeletedMessagesAction}
                fetchMoreEditedAction={fetchMoreEditedMessagesAction}
                guildId={guild_id}
            />
        </div>
    );
}