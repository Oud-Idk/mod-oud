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
import { getGuildChannels, getRoleMap, getTextChannelMap } from "@/utils/discord";
import { getLevels } from "@/utils/db/leaderboard";
import { fetchMoreLevelsAction } from "@/actions/leaderboard";

interface PageProps {
    params: Promise<{ guild_id: string }>
}

export default async function LevelingPage({ params }: PageProps) {
    const { guild_id } = await params;
    const formula = "f(l) = 5l^2 + 50l + 100";
    const cumulativeFormula = "\\sum_{i=0}^{N-1} (5i^2 + 50i + 100) = \\frac{5N(N-1)(2N-1)}{6} + 25N(N-1) + 100N";

    const [
        levelingConfig,
        channelMap,
        roleMap,
        multipliers,
        levelRewards,
        channels,
        levels,
    ] = await Promise.all([
        getLevelingConfig(guild_id),
        getTextChannelMap(guild_id),
        getRoleMap(guild_id),
        getXpMultipliers(guild_id),
        getLevelRewards(guild_id),
        getGuildChannels(guild_id),
        getLevels(guild_id), // TODO cache this mf
    ]);

    const onSave = saveLevelingConfigAction.bind(null, guild_id);

    const onSaveMultipliers = saveMultipliersAction.bind(null, guild_id);
    const onDeleteMultipliers = deleteMultipliersAction.bind(null, guild_id);
    const onSaveLevelRewards = saveRewardsAction.bind(null, guild_id);
    const onDeleteLevelRewards = deleteRewardsAction.bind(null, guild_id);
    const fetchMoreLevels = fetchMoreLevelsAction.bind(null, guild_id);

    return (
        <div>
            <DashboardHeader>Leveling</DashboardHeader>

            <details className="group border rounded-lg p-2 transition-all">
                <summary className="font-medium cursor-pointer list-none flex items-center justify-between select-none">
                    <span>View Leveling Formulas & XP Math</span>
                    <span className="transition group-open:rotate-180">
                        <svg
                            fill="none"
                            height="24"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            viewBox="0 0 24 24"
                            width="24"
                            className="w-4 h-4 text-neutral-500"
                        >
                            <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                    </span>
                </summary>

                <div className="mt-2 space-y-4">
                    <p className="text-sm dark:text-neutral-400">
                        The polynomial used to find out how much XP the user needs to level up in each level is: </p>
                    <Math tex={formula} display/>

                    <p className="text-sm dark:text-neutral-400">
                        Fun fact: To achieve <Math tex="\mathcal{O}(1)"/> time complexity when
                        calculating cumulative XP,
                        we can avoid a loop over every level by using the sum of powers formula to calculate the total
                        XP
                        needed to reach level <Math tex="N"/>: </p>
                    <Math tex={cumulativeFormula} display/>
                </div>
            </details>

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
                levels={levels}
                fetchMoreLevels={fetchMoreLevels}
            />
        </div>
    )
}