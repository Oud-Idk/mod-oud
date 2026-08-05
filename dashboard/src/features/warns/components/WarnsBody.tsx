"use client";

import { TabItem, Tabs } from "@/components/layout/Tabs";
import { ReactNode, useState } from "react";
import { HistoryTab } from "@/features/warns/components/Tabs/HistoryTab";
import { WarnThresholdTab } from "@/features/warns/components/Tabs/WarnThresholdsTab";
import { WarnThreshold } from "@/features/warns/types";

type TabValue = "HISTORY" | "ACTION_THRESHOLDS";

const WARNS_TABS: TabItem<TabValue>[] = [
    { value: "HISTORY", label: "History" },
    { value: "ACTION_THRESHOLDS", label: "Warn Thresholds" },
];

interface WarnsBodyProps {
    guildId: string;
    initialThresholds: WarnThreshold[];
    roleMap: Record<string, string>;
}

export function WarnsBody({ guildId, initialThresholds, roleMap }: WarnsBodyProps): ReactNode {
    const [activeTab, setActiveTab] = useState<TabValue>("HISTORY")

    return <div>
        <Tabs activeTab={activeTab} tabs={WARNS_TABS} onChange={t => setActiveTab(t)}/>
        {activeTab === "HISTORY" && <HistoryTab guildId={guildId}/>}
        {activeTab === "ACTION_THRESHOLDS" &&
            <WarnThresholdTab guildId={guildId} thresholds={initialThresholds} roleMap={roleMap}/>}
    </div>
}