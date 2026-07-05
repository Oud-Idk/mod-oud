"use client";

import { TabItem, Tabs } from "@/components/Tabs";
import { useState } from "react";
import { HistoryTab } from "@/components/Dashboards/Warns/Tabs/HistoryTab";
import { WarnThresholdTab } from "@/components/Dashboards/Warns/Tabs/WarnThresholdsTab";
import { WarnThreshold } from "@/actions/warns";

type TabValue = "history" | "action_thresholds";

const WARNS_TABS: TabItem<TabValue>[] = [
    { value: "history", label: "history" },
    { value: "action_thresholds", label: "Warn Thresholds" },
];

interface WarnsBodyProps {
    guildId: string;
    initialThresholds: WarnThreshold[];
    roleMap: Record<string, string>;
}

export function WarnsBody({ guildId, initialThresholds, roleMap }: WarnsBodyProps) {
    const [activeTab, setActiveTab] = useState<TabValue>("history")

    return <div>
        <Tabs activeTab={activeTab} tabs={WARNS_TABS} onChange={t => setActiveTab(t as TabValue)}/>
        {activeTab === "history" && <HistoryTab guildId={guildId}/>}
        {activeTab === "action_thresholds" &&
            <WarnThresholdTab guildId={guildId} thresholds={initialThresholds} roleMap={roleMap}/>}
    </div>
}