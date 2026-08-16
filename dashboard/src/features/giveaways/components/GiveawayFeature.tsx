import { JSX } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getGiveaways } from "@/features/giveaways/queries";
import { getTextChannelMap } from "@/features/_shared/channels";
import {
    deleteGiveawayAction,
    deleteGiveawayDiscordMessageAction,
    saveGiveawayAction,
    sendGiveawayAction
} from "@/features/giveaways/actions";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { GiveawaysBody } from "@/features/giveaways/components/GiveawayBody";

interface GiveawayFeatureProps {
    guildId: string;
    activeId?: string;
}

export async function GiveawayFeature({ guildId, activeId }: GiveawayFeatureProps): Promise<JSX.Element> {
    const session = await auth();

    if (session?.user.id === undefined) {
        redirect("/");
    }

    const userId = session.user.id;


    const [giveaways, channelMap] = await Promise.all([
        getGiveaways(guildId),
        getTextChannelMap(guildId),
    ]);

    const activeConfig =
        giveaways.find((g) => String(g.id) === String(activeId)) ??
        giveaways[0];

    const onSave = saveGiveawayAction.bind(null, guildId);
    const onDelete = deleteGiveawayAction.bind(null, guildId);
    const onSend = sendGiveawayAction.bind(null, guildId);
    const onDeleteDiscordMessage = deleteGiveawayDiscordMessageAction.bind(null, guildId);

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
                guildId={guildId}
            />
        </div>
    );
}