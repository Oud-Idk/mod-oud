import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { getRoleMap, getTextChannelMap } from "@/features/_shared/channels";
import { getReactionMessages } from "../queries";
import {
    deleteReactionDiscordMessageAction,
    deleteReactionMessageAction,
    saveReactionMessageAction,
    sendReactionMessageAction,
} from "../actions";
import { ReactionRolesBody } from "./ReactionRolesBody";
import { JSX} from "react";

interface ReactionRolesFeatureProps {
    guildId: string;
    activeId?: string;
}

export async function ReactionRolesFeature({
    guildId,
    activeId,
}: ReactionRolesFeatureProps): Promise<JSX.Element> {
    const [reactionRoles, channelMap, roleMap] = await Promise.all([
        getReactionMessages(guildId),
        getTextChannelMap(guildId),
        getRoleMap(guildId),
    ]);

    const activeConfig =
        reactionRoles.find((role) => String(role.id) === String(activeId)) ||
        reactionRoles[0] ||
        null;

    const onSave = saveReactionMessageAction.bind(null, guildId);
    const onDelete = deleteReactionMessageAction.bind(null, guildId);
    const onSend = sendReactionMessageAction.bind(null, guildId);
    const onDeleteDiscordMessage = deleteReactionDiscordMessageAction.bind(null, guildId);

    return (
        <div>
            <DashboardHeader>Reaction Roles</DashboardHeader>
            <ReactionRolesBody
                reactionRoles={reactionRoles}
                onSave={onSave}
                onDelete={onDelete}
                onSend={onSend}
                onDeleteDiscordMessage={onDeleteDiscordMessage}
                activeConfig={activeConfig}
                channelMap={channelMap}
                roleMap={roleMap}
                guildId={guildId}
            />
        </div>
    );
}