import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { ReactionRolesBody } from "@/components/Dashboards/ReactionRoles/ReactionRolesBody";
import { getReactionMessages } from "@/utils/db/reactionRoles";
// Import the new action
import {
    deleteReactionDiscordMessageAction,
    deleteReactionMessageAction,
    saveReactionMessageAction,
    sendReactionMessageAction
} from "@/actions/reactionRoles";
import { getRoleMap, getTextChannelMap } from "@/utils/discord";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
    searchParams: Promise<{ id?: string }>;
}

export default async function ReactionRolesPage({ params, searchParams }: PageProps) {
    const { guild_id } = await params;
    const { id: activeId } = await searchParams;

    const [reactionRoles, channelMap, roleMap] = await Promise.all([
        getReactionMessages(guild_id),
        getTextChannelMap(guild_id),
        getRoleMap(guild_id),
    ]);

    const activeConfig =
        reactionRoles.find((role) => String(role.id) === String(activeId)) ||
        reactionRoles[0] ||
        null;

    const onSave = saveReactionMessageAction.bind(null, guild_id);
    const onDelete = deleteReactionMessageAction.bind(null, guild_id);
    const onSend = sendReactionMessageAction.bind(null, guild_id);
    const onDeleteDiscordMessage = deleteReactionDiscordMessageAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Reaction Roles</DashboardHeader>
            <ReactionRolesBody
                reactionRoles={reactionRoles}
                onSave={onSave}
                onDelete={onDelete}
                onSend={onSend}
                onDeleteDiscordMessage={onDeleteDiscordMessage} // Added
                activeConfig={activeConfig}
                channelMap={channelMap}
                roleMap={roleMap}
            />
        </div>
    );
}