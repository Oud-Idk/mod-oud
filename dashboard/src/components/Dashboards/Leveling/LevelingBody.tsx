"use client";

import { LevelingConfig } from "@/types/db/config";
import { useMemo, useState } from "react";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { TabItem, Tabs } from "@/components/Layout/Tabs";
import { TextTab } from "@/components/Dashboards/Leveling/Tabs/TextTab";
import { VoiceTab } from "@/components/Dashboards/Leveling/Tabs/VoiceTab";
import { GeneralTab } from "@/components/Dashboards/Leveling/Tabs/GeneralTab";
import { MultiplierTab } from "@/components/Dashboards/Leveling/Tabs/MultiplierTab";
import { RewardTab } from "@/components/Dashboards/Leveling/Tabs/RewardTab";
import { DiscordChannel } from "@/types";
import { useConfigForm } from "@/hooks/useConfigForm";
import { UserLevel } from "@/utils/db/leaderboard";
import { LeaderboardTab } from "@/components/Dashboards/Leveling/Tabs/LeaderboardTab";
import { LevelReward, XpMultiplier } from "@/types/db/multipliers";
import { ImageCardTab } from "@/components/Dashboards/Leveling/Tabs/ImageCardTab";
import { setConfig } from "@skyra/discord-components-react";

interface LevelingBodyProps {
    guildId: string;
    levelingConfig: LevelingConfig;
    onSave: (config: LevelingConfig) => Promise<void>;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
    multipliers: XpMultiplier[];
    rewards: LevelReward[];
    onSaveMultipliers: (targets: any[]) => Promise<void>;
    onSaveRewards: (rewards: any[]) => Promise<void>;
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
}: LevelingBodyProps) {
    const normalizedLevelingConfig = useMemo(() => levelingConfig, [levelingConfig]);
    const [activeTab, setActiveTab] = useState<TabValue>("TEXT");

    const {
        config,
        isPending,
        isDirty,
        setIsEmpty,
        handleSave,
        handleCancel,
        handleChange,
    } = useConfigForm({
        initialConfig: normalizedLevelingConfig,
        onSave,
    });

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
                    setIsEmpty={setIsEmpty}
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
                <LeaderboardTab
                    levels={levels} fetchMoreLevels={fetchMoreLevels}
                />
            )}

            {activeTab === "IMAGE_CARD" && (
                <ImageCardTab config={config} handleChange={handleChange}/>
            )}

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}
        </div>
    );
}