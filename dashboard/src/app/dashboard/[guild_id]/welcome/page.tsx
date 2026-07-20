import { WelcomeBody } from "@/components/Dashboards/Welcome/WelcomeBody";
import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { auth } from "@/auth";
import { getGuildChannels, getGuildRoles, getTextChannelMap } from "@/utils/discord";
import { getWelcomeConfig } from "@/utils/db/config";
import { saveWelcomeConfigAction } from "@/actions/config";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function WelcomePage({ params }: PageProps) {
    const { guild_id } = await params;
    const session = await auth();

    const [welcomeConfig, channels, roles, channelMap] = await Promise.all([
        getWelcomeConfig(guild_id),
        getGuildChannels(guild_id),
        getGuildRoles(guild_id),
        getTextChannelMap(guild_id)
    ]);

    const profilePictureUrl = session?.user?.image || undefined;
    const onSave = saveWelcomeConfigAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Welcome Message</DashboardHeader>
            <div>
                <WelcomeBody
                    guildId={guild_id}
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