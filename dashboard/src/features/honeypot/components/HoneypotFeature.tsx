import React, { JSX } from "react";
import { getRoleMap, getTextChannelMap } from "@/features/_shared/channels";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { HoneypotBody } from "@/features/honeypot/components/HoneypotBody";
import { saveHoneypotConfigAction } from "@/features/honeypot/actions";
import { getHoneypotConfig } from "@/features/honeypot/queries";
import Footer from "@/components/layout/Footer";

interface HoneypotFeatureProps {
    guildId: string;
}

export async function HoneypotFeature({ guildId }: HoneypotFeatureProps): Promise<JSX.Element> {
    const [textChannelMap, roleMap, settings] = await Promise.all([
        getTextChannelMap(guildId),
        getRoleMap(guildId),
        getHoneypotConfig(guildId),
    ]);

    const onSave = saveHoneypotConfigAction.bind(null, guildId);

    return (
        <div>
            <DashboardHeader className="mb-1">Honeypot Channel</DashboardHeader>

            <Footer className="mb-0">
                A honeypot channel will instantly ban anyone who sends a message in it.
            </Footer>
            <Footer className="mb-2">
                Please use Embed Builder to send custom embed messages to this channel.
            </Footer>

            <HoneypotBody
                honeypotConfig={settings}
                onSave={onSave}
                textChannelMap={textChannelMap}
                guildId={guildId}
                roleMap={roleMap}
            />
        </div>
    );
}