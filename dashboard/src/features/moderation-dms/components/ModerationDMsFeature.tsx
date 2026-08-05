import { DashboardHeader } from "@/components/dashboard/DashboardHeader"; // Generic UI
import { getModerationDMsConfig } from "../queries";
import { saveModerationDMsConfigAction } from "../actions";
import { ModerationDMsBody } from "./ModerationDMsBody";
import { ReactNode } from "react";

interface ModerationDMsFeatureProps {
    guildId: string;
}

export async function ModerationDMsFeature({ guildId }: ModerationDMsFeatureProps): Promise<ReactNode> {
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