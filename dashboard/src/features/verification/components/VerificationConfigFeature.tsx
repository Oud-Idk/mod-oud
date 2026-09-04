import { getGuildRoles, getTextChannelMap } from "@/features/_shared/channels";
import { saveVerificationConfigAction } from "../actions";
import { getVerificationConfig } from "../queries";
import { VerificationBody } from "./VerificationBody";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { JSX } from "react";

interface VerificationConfigFeatureProps {
    guildId: string;
}

export async function VerificationConfigFeature({ guildId }: VerificationConfigFeatureProps): Promise<JSX.Element> {
    const [verificationConfig, roles, channelMap] = await Promise.all([
        getVerificationConfig(guildId),
        getGuildRoles(guildId),
        getTextChannelMap(guildId),
    ]);

    const onSave = saveVerificationConfigAction.bind(null, guildId);

    return (
        <div>
            <DashboardHeader>Verification</DashboardHeader>
            <div>
                <VerificationBody
                    guildId={guildId}
                    verificationConfig={verificationConfig}
                    roles={roles}
                    onSave={onSave}
                    channelMap={channelMap}
                />
            </div>
        </div>
    );
}
