import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { getRoleMap, getTextChannelMap } from "@/features/_shared/channels";
import { getStarboardConfigs } from "../queries";
import { StarboardBody } from "./StarboardBody";
import { deleteStarboardConfigAction, saveStarboardConfigAction } from "@/features/starboard/actions";
import { JSX} from "react";

interface Props {
    guildId: string;
    activeConfigId?: string;
}

export async function StarboardFeature({ guildId, activeConfigId }: Props): Promise<JSX.Element> {
    const [starboardConfigs, channelMap, roleMap] = await Promise.all([
        getStarboardConfigs(guildId),
        getTextChannelMap(guildId),
        getRoleMap(guildId),
    ]);

    const activeConfig = activeConfigId
        ? (starboardConfigs.find((config) => config.id === activeConfigId) || null)
        : (starboardConfigs[0] || null);

    const onSave = saveStarboardConfigAction.bind(null, guildId);
    const onDelete = deleteStarboardConfigAction.bind(null, guildId);

    return (
        <div>
            <DashboardHeader>Starboard</DashboardHeader>
            <StarboardBody
                guildId={guildId}
                starboardConfigs={starboardConfigs}
                activeConfig={activeConfig}
                channelMap={channelMap}
                roleMap={roleMap}
                onSave={onSave}
                onDelete={onDelete}
            />
        </div>
    );
}