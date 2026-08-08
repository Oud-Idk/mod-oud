import { getGuildChannels, getRoleMap, getTextChannelMap } from "@/features/_shared/channels";
import {
    deleteMultipliersAction,
    deleteRewardsAction, fetchMoreLevelsAction, saveLevelingConfigAction,
    saveMultipliersAction,
    saveRewardsAction
} from "@/features/leveling/actions";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import Math from "@/components/ui/Math";
import { Pad } from "@/components/layout/Pad";
import { LevelingBody } from "@/features/leveling/components/LevelingBody";
import { getLevelingConfig, getLevelRewards, getLevels, getXpMultipliers } from "@/features/leveling/queries";

interface LevelingFeatureProps {
    guildId: string;
}

export async function LevelingFeature({ guildId }: LevelingFeatureProps) {
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
        getLevelingConfig(guildId),
        getTextChannelMap(guildId),
        getRoleMap(guildId),
        getXpMultipliers(guildId),
        getLevelRewards(guildId),
        getGuildChannels(guildId),
        getLevels(guildId),
    ]);

    const onSave = saveLevelingConfigAction.bind(null, guildId);

    const onSaveMultipliers = saveMultipliersAction.bind(null, guildId);
    const onDeleteMultipliers = deleteMultipliersAction.bind(null, guildId);
    const onSaveLevelRewards = saveRewardsAction.bind(null, guildId);
    const onDeleteLevelRewards = deleteRewardsAction.bind(null, guildId);
    const fetchMoreLevels = fetchMoreLevelsAction.bind(null, guildId);

    return (
        <div>
            <DashboardHeader>Leveling</DashboardHeader>

            <details className="group border border-border rounded-lg p-2 transition-all">
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
                    <p className="text-sm">
                        The polynomial used to find out how much XP the user needs to level up in each level is: </p>
                    <Math tex={formula} display/>

                    <p className="text-sm">
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
                guildId={guildId}
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