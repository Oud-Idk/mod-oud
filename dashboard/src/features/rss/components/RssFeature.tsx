import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { getTextChannelMap } from "@/features/_shared/channels";
import { JSX } from "react";
import { addFeedSubscriptionAction, removeFeedSubscriptionAction } from "../actions";
import { getFeedSubscriptions } from "../queries";
import { RssBody } from "./RssBody";

interface RssFeatureProps {
    guildId: string;
}

export async function RssFeature({ guildId }: RssFeatureProps): Promise<JSX.Element> {
    const [subscriptions, channelMap] = await Promise.all([
        getFeedSubscriptions(guildId),
        getTextChannelMap(guildId),
    ]);

    const onAdd = addFeedSubscriptionAction.bind(null, guildId);
    const onRemove = removeFeedSubscriptionAction.bind(null, guildId);

    return (
        <div className="space-y-6">
            <DashboardHeader>RSS / PubSubHubbub</DashboardHeader>
            <RssBody
                subscriptions={subscriptions}
                channelMap={channelMap}
                onAdd={onAdd}
                onRemove={onRemove}
            />
        </div>
    );
}
