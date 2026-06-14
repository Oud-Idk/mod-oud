import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { LevelingBody } from "@/components/Dashboards/Leveling/LevelingBody";
import { getLevelingConfig } from "@/utils/db/config";
import { saveLevelingConfigAction } from "@/actions/config";
import { getXpMultipliers } from "@/utils/db/multipliers";
import { deleteMultipliersAction, saveMultipliersAction } from "@/actions/multipliers";
import Math from "@/components/Math";
import { Pad } from "@/components/Pad";
import { getChannelMap, getRoleMap } from "@/utils/discord";

interface PageProps {
    params: Promise<{ guild_id: string }>
}

export default async function LevelingPage({ params }: PageProps) {
    const { guild_id } = await params;
    const formula = String.raw`(5\times \text{level}^2) + (50\times \text{level}) + 100`;

    const [
        levelingConfig,
        channelMap,
        roleMap,
        multipliers,
    ] = await Promise.all([
        getLevelingConfig(guild_id),
        getChannelMap(guild_id),
        getRoleMap(guild_id),
        getXpMultipliers(guild_id),
    ]);

    const onSave = saveLevelingConfigAction.bind(null, guild_id);

    // Bind the new bulk actions
    const onSaveMultipliers = saveMultipliersAction.bind(null, guild_id);
    const onDeleteMultipliers = deleteMultipliersAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Leveling Settings</DashboardHeader>
            <p>The polynomial used to find out how much XP the user needs to level up in each level is</p>
            <Math tex={formula}/>

            <Pad/>
            <LevelingBody
                guildId={guild_id} // Passed to resolve type checking in optimistic updates
                levelingConfig={levelingConfig}
                onSave={onSave}
                channelMap={channelMap}
                roleMap={roleMap}
                multipliers={multipliers}
                onSaveMultipliers={onSaveMultipliers} // Hooked to new bulk actions
                onDeleteMultipliers={onDeleteMultipliers}
            />
        </div>
    )
}