import { redirect } from "next/navigation";
import { auth } from "@/auth";

import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { GiveawaysBody } from "@/components/Dashboards/Giveaway/GiveawayBody";
import { getGiveaways } from "@/utils/db/giveaways";
import {
    deleteGiveawayAction,
    deleteGiveawayDiscordMessageAction,
    saveGiveawayAction,
    sendGiveawayAction,
} from "@/actions/giveaways";
import { getTextChannelMap } from "@/utils/discord";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
    searchParams: Promise<{ id?: string }>;
}

export default async function GiveawayPage({ params, searchParams }: PageProps) {
    const session = await auth();

    console.log(session);
    if (!session?.user?.id) {
        redirect("/");
    }

    const userId = session.user.id;

    const { guild_id } = await params;
    const { id: activeId } = await searchParams;

    const [giveaways, channelMap] = await Promise.all([
        getGiveaways(guild_id),
        getTextChannelMap(guild_id),
    ]);

    const activeConfig =
        giveaways.find((g) => String(g.id) === String(activeId)) ||
        giveaways[0] ||
        null;

    const onSave = saveGiveawayAction.bind(null, guild_id);
    const onDelete = deleteGiveawayAction.bind(null, guild_id);
    const onSend = sendGiveawayAction.bind(null, guild_id);
    const onDeleteDiscordMessage = deleteGiveawayDiscordMessageAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Giveaways</DashboardHeader>
            <GiveawaysBody
                giveaways={giveaways}
                activeConfig={activeConfig}
                onSave={onSave}
                onDelete={onDelete}
                onSend={onSend}
                onDeleteDiscordMessage={onDeleteDiscordMessage}
                channelMap={channelMap}
                userId={userId}
            />
        </div>
    );
}