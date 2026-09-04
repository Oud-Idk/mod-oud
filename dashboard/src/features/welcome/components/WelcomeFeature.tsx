import { getGuildChannels, getGuildRoles } from "@/features/_shared/channels";
import { saveWelcomeConfigAction } from "../actions";
import { getWelcomeConfig } from "../queries";
import { WelcomeBody } from "./WelcomeBody";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { JSX} from "react";

interface WelcomeFeatureProps {
    guildId: string;
}

export async function WelcomeFeature({ guildId }: WelcomeFeatureProps): Promise<JSX.Element> {
    const [welcomeConfig, channels, roles] = await Promise.all([
        getWelcomeConfig(guildId),
        getGuildChannels(guildId),
        getGuildRoles(guildId),
    ]);

    const onSave = saveWelcomeConfigAction.bind(null, guildId);

    return (
        <div>
            <DashboardHeader>Welcome Message</DashboardHeader>
            <div>
                <WelcomeBody
                    welcomeConfig={welcomeConfig}
                    channels={channels}
                    roles={roles}
                    onSave={onSave}
                />
            </div>
        </div>
    );
}
