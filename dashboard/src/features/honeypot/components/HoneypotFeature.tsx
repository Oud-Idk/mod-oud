import React, { ReactNode } from "react";
import { getRoleMap, getTextChannelMap } from "@/features/_shared/channels";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { HoneypotBody } from "@/features/honeypot/components/HoneypotBody";

import { saveHoneypotConfigAction } from "@/features/honeypot/actions";
import { getHoneypotConfig } from "@/features/honeypot/queries";
import Footer from "@/components/layout/Footer";

interface HoneypotFeatureProps {
    guildId: string;
}

export async function HoneypotFeature({ guildId }: HoneypotFeatureProps): Promise<ReactNode> {
    const [textChannelMap, roleMap, settings] = await Promise.all([
        getTextChannelMap(guildId),
        getRoleMap(guildId),
        getHoneypotConfig(guildId)],
    );
    const onSave = saveHoneypotConfigAction.bind(null, guildId);

    return <div>
        <DashboardHeader className="mb-1">Honeypot Channel</DashboardHeader>

        <Footer className="mb-0">A honeypot channel in this case means a channel that will instantly ban anyone who sent a message.</Footer>
        <Footer className="mb-1">Since the developer is honking lazy, please go to Embed Builder and send an embed to the channel.</Footer>

        <HoneypotBody
            honeypotConfig={settings}
            onSave={onSave}
            textChannelMap={textChannelMap}
            guildId={guildId}
            roleMap={roleMap}
        />
    </div>
}