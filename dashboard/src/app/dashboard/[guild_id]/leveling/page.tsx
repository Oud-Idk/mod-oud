import { DashboardHeader } from "@/components/Dashboards/General/DashboardHeader";
import { LevelingBody } from "@/components/Dashboards/Leveling/LevelingBody";
import { getLevelingConfig } from "@/utils/db/config";
import { saveLevelingConfigAction } from "@/actions/config";
import { getLevelRewards, getXpMultipliers } from "@/utils/db/leveling";
import {
    deleteMultipliersAction,
    deleteRewardsAction,
    saveMultipliersAction,
    saveRewardsAction
} from "@/actions/levels";
import Math from "@/components/Math";
import { Pad } from "@/components/Pad";
import { getChannelMap, getGuildChannels, getRoleMap } from "@/utils/discord";

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
        levelRewards,
        channels,
    ] = await Promise.all([
        getLevelingConfig(guild_id),
        getChannelMap(guild_id),
        getRoleMap(guild_id),
        getXpMultipliers(guild_id),
        getLevelRewards(guild_id),
        getGuildChannels(guild_id),
    ]);

    const onSave = saveLevelingConfigAction.bind(null, guild_id);

    // Bind the new bulk actions
    const onSaveMultipliers = saveMultipliersAction.bind(null, guild_id);
    const onDeleteMultipliers = deleteMultipliersAction.bind(null, guild_id);
    const onSaveLevelRewards = saveRewardsAction.bind(null, guild_id);
    const onDeleteLevelRewards = deleteRewardsAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Leveling Settings</DashboardHeader>
            <p>The polynomial used to find out how much XP the user needs to level up in each level is</p>
            <Math tex={formula}/>

            <Pad/>
            <LevelingBody
                guildId={guild_id}
                levelingConfig={levelingConfig}
                onSave={onSave}
                channelMap={channelMap}
                roleMap={roleMap}
                multipliers={multipliers}
                rewards={levelRewards}
                onSaveMultipliers={onSaveMultipliers}
                onSaveRewards={onSaveLevelRewards}
                onDeleteMultipliers={onDeleteMultipliers}
                onDeleteRewards={onDeleteLevelRewards}
                channels={channels}
            />
        </div>
    )
}