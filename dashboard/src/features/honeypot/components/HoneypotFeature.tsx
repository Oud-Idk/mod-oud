import React, { ReactNode } from "react";
import { getRoleMap, getTextChannelMap } from "@/features/_shared/channels";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { HoneypotBody } from "@/features/honeypot/components/HoneypotBody";

import { saveHoneypotConfigAction } from "@/features/honeypot/actions";
import { getHoneypotConfig } from "@/features/honeypot/queries";

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

        <HoneypotBody
            honeypotConfig={settings}
            onSave={onSave}
            textChannelMap={textChannelMap}
            guildId={guildId}
            roleMap={roleMap}
        />
    </div>
}