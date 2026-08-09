import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { getModerationDMsConfig } from "../queries";
import { saveModerationDMsConfigAction } from "../actions";
import { ModerationDMsBody } from "./ModerationDMsBody";
import { JSX } from "react";

interface ModerationDMsFeatureProps {
    guildId: string;
}

export async function ModerationDMsFeature({ guildId }: ModerationDMsFeatureProps): Promise<JSX.Element> {
    const moderationDMsConfig = await getModerationDMsConfig(guildId);
    const handleSave = saveModerationDMsConfigAction.bind(null, guildId);

    return (
        <div className="space-y-6">
            <DashboardHeader>Moderation DM</DashboardHeader>
            <ModerationDMsBody
                moderationDMsConfig={moderationDMsConfig}
                onSave={handleSave}
            />
        </div>
    );
}