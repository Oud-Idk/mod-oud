import { auth } from "@/lib/auth";
import { getGuildChannels, getGuildRoles, getTextChannelMap } from "@/features/_shared/channels";
import { saveWelcomeConfigAction } from "../actions";
import { getWelcomeConfig } from "../queries";
import { WelcomeBody } from "./WelcomeBody";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { ReactNode } from "react";

interface WelcomeFeatureProps {
    guildId: string;
}

export async function WelcomeFeature({ guildId }: WelcomeFeatureProps): Promise<ReactNode> {
    const session = await auth();

    const [welcomeConfig, channels, roles, channelMap] = await Promise.all([
        getWelcomeConfig(guildId),
        getGuildChannels(guildId),
        getGuildRoles(guildId),
        getTextChannelMap(guildId),
    ]);

    const profilePictureUrl = session?.user?.image || undefined;
    const onSave = saveWelcomeConfigAction.bind(null, guildId);

    return (
        <div>
            <DashboardHeader>Welcome Message</DashboardHeader>
            <div>
                <WelcomeBody
                    guildId={guildId}
                    welcomeConfig={welcomeConfig}
                    channels={channels}
                    roles={roles}
                    onSave={onSave}
                    channelMap={channelMap}
                    profilePictureUrl={profilePictureUrl}
                />
            </div>
        </div>
    );
}