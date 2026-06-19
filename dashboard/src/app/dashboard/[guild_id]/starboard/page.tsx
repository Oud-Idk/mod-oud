import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { getStarboardConfigs } from "@/utils/db/starboard";
import { getChannelMap, getRoleMap } from "@/utils/discord";
import { StarboardBody } from "@/components/Dashboards/Starboard/StarboardBody";
import { deleteStarboardConfigAction, saveStarboardConfigAction } from "@/actions/starboard";

interface PageProps {
    params: Promise<{ guild_id: string }>;
    searchParams: Promise<{ id?: string }>;
}

export default async function StarboardPage({ params, searchParams }: PageProps) {
    const { guild_id } = await params;
    const { id } = await searchParams;

    const [starboardConfigs, channelMap, roleMap] = await Promise.all([
        getStarboardConfigs(guild_id),
        getChannelMap(guild_id),
        getRoleMap(guild_id),
    ]);

    const activeConfig = id
        ? (starboardConfigs.find((config) => config.id === id) || null)
        : (starboardConfigs[0] || null);

    const onSave = saveStarboardConfigAction.bind(null, guild_id);
    const onDelete = deleteStarboardConfigAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Starboard</DashboardHeader>
            <StarboardBody
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