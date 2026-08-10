import React, { JSX } from "react";
import { getRoleMap, getTextChannelMap } from "@/features/_shared/channels";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { MediaOnlyBody } from "@/features/media-only/components/MediaOnlyBody";
import { saveMediaOnlyChannelsAction } from "@/features/media-only/actions";
import { getMediaOnlyChannels } from "@/features/media-only/queries";
import Footer from "@/components/layout/Footer";

interface MediaOnlyFeatureProps {
    guildId: string;
}

export async function MediaOnlyFeature({ guildId }: MediaOnlyFeatureProps): Promise<JSX.Element> {
    const [textChannelMap, roleMap, channels] = await Promise.all([
        getTextChannelMap(guildId),
        getRoleMap(guildId),
        getMediaOnlyChannels(guildId),
    ]);

    const onSave = saveMediaOnlyChannelsAction.bind(null, guildId);

    return (
        <div>
            <DashboardHeader className="mb-1">Media Only</DashboardHeader>

            <Footer className="mb-0">
                Restrict a channel so only media can be posted in it.
            </Footer>
            <Footer className="mb-2">
                Anything that is not allowed (text, files, embeds, links) will be deleted and the sender warned.
            </Footer>

            <MediaOnlyBody
                channels={channels}
                onSave={onSave}
                textChannelMap={textChannelMap}
                roleMap={roleMap}
            />
        </div>
    );
}
