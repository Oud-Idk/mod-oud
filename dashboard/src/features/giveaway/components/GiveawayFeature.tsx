import { ReactNode } from "react";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getGiveaways } from "@/features/giveaway/queries";
import { getTextChannelMap } from "@/features/_shared/channels";
import {
    deleteGiveawayAction,
    deleteGiveawayDiscordMessageAction,
    saveGiveawayAction,
    sendGiveawayAction
} from "@/features/giveaway/actions";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { GiveawaysBody } from "@/features/giveaway/components/GiveawayBody";

interface GiveawayFeatureProps {
    guildId: string;
    activeId?: string;
}

export async function GiveawayFeature({ guildId, activeId }: GiveawayFeatureProps): Promise<ReactNode> {
    const session = await auth();

    console.log(session);
    if (!session?.user?.id) {
        redirect("/");
    }

    const userId = session.user.id;


    const [giveaways, channelMap] = await Promise.all([
        getGiveaways(guildId),
        getTextChannelMap(guildId),
    ]);

    const activeConfig =
        giveaways.find((g) => String(g.id) === String(activeId)) ||
        giveaways[0] ||
        null;

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