import { WelcomeBody } from "@/components/Dashboards/Welcome/WelcomeBody";
import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { auth } from "@/auth";
import { getGuildChannels, getGuildRoles } from "@/utils/discord";
import { getWelcomeConfig } from "@/utils/db/config";
import { saveWelcomeConfigAction } from "@/actions/config";

export interface PageProps {
    params: Promise<{ guild_id: string }>;
}

export default async function WelcomePage({ params }: PageProps) {
    const { guild_id } = await params;
    const session = await auth();

    const [welcomeConfig, channels, roles] = await Promise.all([
        getWelcomeConfig(guild_id),
        getGuildChannels(guild_id),
        getGuildRoles(guild_id)
    ]);

    const profilePictureUrl = session?.user?.image || undefined;
    const onSave = saveWelcomeConfigAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Welcome Message</DashboardHeader>
            <div>
                <WelcomeBody
                    welcomeConfig={welcomeConfig}
                    channels={channels}
                    roles={roles}
                    onSave={onSave}
                    profilePictureUrl={profilePictureUrl}
                />
            </div>
        </div>
    );
}