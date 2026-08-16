"use client";

import { useMemo, useState, useCallback, JSX } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import { TextTab } from "@/features/leveling/components/Tabs/TextTab";
import { VoiceTab } from "@/features/leveling/components/Tabs/VoiceTab";
import { GeneralTab } from "@/features/leveling/components/Tabs/GeneralTab";
import { MultiplierTab } from "@/features/leveling/components/Tabs/MultiplierTab";
import { RewardTab } from "@/features/leveling/components/Tabs/RewardTab";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { LeaderboardTab } from "@/features/leveling/components/Tabs/LeaderboardTab";
import { ImageCardTab } from "@/features/leveling/components/Tabs/ImageCardTab";
import {
    UserLevel,
    LevelingConfig,
    LevelReward,
    XpMultiplier,
    SaveXpMultiplierInput,
    SaveLevelRewardInput,
    saveLevelingConfigSchema
} from "@/features/leveling/types";
import { toast } from "sonner";

import { DiscordChannel } from "@/features/_shared/channels.types";

interface LevelingBodyProps {
    guildId: string;
    levelingConfig: LevelingConfig;
    onSave: (config: LevelingConfig) => Promise<void>;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
    multipliers: XpMultiplier[];
    rewards: LevelReward[];
    onSaveMultipliers: (targets: SaveXpMultiplierInput[]) => Promise<void>;
    onSaveRewards: (rewards: SaveLevelRewardInput[]) => Promise<void>;
    onDeleteMultipliers: (targetIds: string[]) => Promise<void>;
    onDeleteRewards: (ids: number[]) => Promise<void>;
    channels: DiscordChannel[];
    levels: UserLevel[];
    fetchMoreLevels: (currentLowestXp: number) => Promise<UserLevel[]>;
}

type TabValue = "TEXT" | "VOICE" | "GENERAL" | "MULTIPLIERS" | "REWARDS" | "LEADERBOARD" | "IMAGE_CARD";

const LEVEL_TABS: TabItem<TabValue>[] = [
    { value: "TEXT", label: "Text" },
    { value: "VOICE", label: "Voice" },
    { value: "GENERAL", label: "General" },
    { value: "MULTIPLIERS", label: "Multipliers" },
    { value: "REWARDS", label: "Rewards" },
    { value: "LEADERBOARD", label: "Leaderboard" },
    { value: "IMAGE_CARD", label: "Image Card" },
];

export function LevelingBody({
    guildId,
    levelingConfig,
    onSave,
    channelMap,
    roleMap,
    multipliers,
    rewards,
    onSaveMultipliers,
    onSaveRewards,
    onDeleteMultipliers,
    onDeleteRewards,
    channels,
    levels,
    fetchMoreLevels,
}: LevelingBodyProps): JSX.Element {
    const normalizedLevelingConfig = useMemo(() => levelingConfig, [levelingConfig]);
    const [activeTab, setActiveTab] = useState<TabValue>("TEXT");

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        handleSave: originalHandleSave,
        handleCancel,
    } = useConfigForm({
        initialConfig: normalizedLevelingConfig,
        onSave,
    });

    const handleSave = useCallback((): void => {
        const result = saveLevelingConfigSchema.safeParse(config);
        if (!result.success) {
            toast.error(result.error.issues[0].message);
            return;
        }
        originalHandleSave();
    }, [config, originalHandleSave]);

    const handleChange = useCallback((updated: Partial<LevelingConfig>) => {
        setConfig((prev) => ({ ...prev, ...updated }));
    }, [setConfig]);

    return (
        <div>
            <Tabs tabs={LEVEL_TABS} activeTab={activeTab} onChange={setActiveTab}/>
            {activeTab === "TEXT" && <TextTab config={config} handleChange={handleChange}/>}
            {activeTab === "VOICE" && <VoiceTab config={config} handleChange={handleChange}/>}
            {activeTab === "GENERAL" && (
                <GeneralTab
                    config={config}
                    handleChange={handleChange}
                    channelMap={channelMap}
                    roleMap={roleMap}
                    channels={channels}
                />
            )}
            {activeTab === "MULTIPLIERS" && (
                <MultiplierTab
                    guildId={guildId}
                    multipliers={multipliers}
                    onSave={onSaveMultipliers}
                    onDelete={onDeleteMultipliers}
                    channelMap={channelMap}
                    roleMap={roleMap}
                />
            )}
            {activeTab === "REWARDS" && (
                <RewardTab
                    guildId={guildId}
                    rewards={rewards}
                    onSave={onSaveRewards}
                    onDelete={onDeleteRewards}
                    roleMap={roleMap}
                />
            )}

            {activeTab === "LEADERBOARD" && (
                <LeaderboardTab levels={levels} fetchMoreLevels={fetchMoreLevels} />
            )}

            {activeTab === "IMAGE_CARD" && (
                <ImageCardTab config={config} handleChange={handleChange} />
            )}

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}
        </div>
    );
}