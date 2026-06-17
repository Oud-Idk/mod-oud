"use client";

import { LevelingConfig } from "@/types/config";
import { XpMultiplier } from "@/utils/db/multipliers";
import { useCallback, useMemo, useState, useTransition } from "react";
import { isDeepEqual } from "@/utils/embed";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { TabItem, Tabs } from "@/components/Tabs";
import { TextTab } from "@/components/Dashboards/Leveling/Tabs/TextTab";
import { VoiceTab } from "@/components/Dashboards/Leveling/Tabs/VoiceTab";
import { GeneralTab } from "@/components/Dashboards/Leveling/Tabs/GeneralTab";
import { MultiplierTab } from "@/components/Dashboards/Leveling/Tabs/MultiplierTab";

interface LevelingBodyProps {
    guildId: string; // Added here
    levelingConfig: LevelingConfig;
    onSave: (config: LevelingConfig) => Promise<void>;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
    multipliers: XpMultiplier[];
    onSaveMultipliers: (
        targets: Array<{ targetId: string; targetType: "channel" | "role"; multiplier: number }>
    ) => Promise<void>;
    onDeleteMultipliers: (targetIds: string[]) => Promise<void>;
}

type TabValue = "text" | "voice" | "general" | "multipliers";

const LEVEL_TABS: TabItem<TabValue>[] = [
    { value: "text", label: "Text" },
    { value: "voice", label: "Voice" },
    { value: "general", label: "General" },
    { value: "multipliers", label: "Multipliers" },
];

export function LevelingBody({
    guildId,
    levelingConfig,
    onSave,
    channelMap,
    roleMap,
    multipliers,
    onSaveMultipliers,
    onDeleteMultipliers,
}: LevelingBodyProps) {
    const normalizedLevelingConfig = useMemo((): LevelingConfig => {
        return levelingConfig;
    }, [levelingConfig]);

    const [config, setConfig] = useState<LevelingConfig>(normalizedLevelingConfig);
    const [activeTab, setActiveTab] = useState<TabValue>("text");
    const [isPending, startTransition] = useTransition();
    const isDirty = !isDeepEqual(config, normalizedLevelingConfig);

    const handleSave = () => {
        startTransition(async () => {
            await onSave(config);
        });
    };

    const handleCancel = () => {
        setConfig(normalizedLevelingConfig);
    };

    const handleChange = useCallback((updated: Partial<LevelingConfig>) => {
        setConfig((prev) => ({
            ...prev,
            ...updated,
        }));
    }, []);

    return (
        <div>
            <Tabs tabs={LEVEL_TABS} activeTab={activeTab} onChange={setActiveTab}/>
            {activeTab === "text" && <TextTab config={config} handleChange={handleChange}/>}
            {activeTab === "voice" && <VoiceTab config={config} handleChange={handleChange}/>}
            {activeTab === "general" && (
                <GeneralTab
                    config={config} handleChange={handleChange} channelMap={channelMap} roleMap={roleMap}
                />
            )}
            {activeTab === "multipliers" && (
                <MultiplierTab
                    guildId={guildId} // Passed to tab
                    multipliers={multipliers}
                    onSave={onSaveMultipliers} // Hooked to bulk callbacks
                    onDelete={onDeleteMultipliers}
                    channelMap={channelMap}
                    roleMap={roleMap}
                />
            )}

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}
        </div>
    );
}