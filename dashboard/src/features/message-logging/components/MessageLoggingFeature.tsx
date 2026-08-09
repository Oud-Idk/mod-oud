import { getRoleMap, getTextChannelMap } from "@/features/_shared/channels";
import {
    fetchMoreDeletedMessagesAction,
    fetchMoreEditedMessagesAction,
    saveMessageLoggingConfigAction,
} from "../actions";
import {
    getDeletedMessagesHistory,
    getEditedMessagesHistory,
    getMessageLoggingConfig,
} from "../queries";
import { MessageLoggingBody } from "./MessageLoggingBody";
import { JSX} from "react";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";

interface MessageLoggingFeatureProps {
    guildId: string;
}

export async function MessageLoggingFeature({ guildId }: MessageLoggingFeatureProps): Promise<JSX.Element> {
    const [
        messageLoggingConfig,
        deletedMessagesHistory,
        updatedMessageHistory,
        channelMap,
        roleMap,
    ] = await Promise.all([
        getMessageLoggingConfig(guildId),
        getDeletedMessagesHistory(guildId),
        getEditedMessagesHistory(guildId),
        getTextChannelMap(guildId),
        getRoleMap(guildId),
    ]);

    const onSave = saveMessageLoggingConfigAction.bind(null, guildId);

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
                guildId={guildId}
            />
    </div>
);
}