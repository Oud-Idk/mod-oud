"use client";

import React, { ReactNode, useState } from "react";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import { HistoryTab } from "./Tabs/HistoryTab";
import { WarnThresholdTab } from "./Tabs/WarnThresholdsTab";
import type { WarnThreshold } from "../types";

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
    const [activeTab, setActiveTab] = useState<TabValue>("HISTORY");

    return (
        <div className="space-y-4">
            <Tabs activeTab={activeTab} tabs={WARNS_TABS} onChange={setActiveTab} />
            {activeTab === "HISTORY" && <HistoryTab guildId={guildId} />}
            {activeTab === "ACTION_THRESHOLDS" && (
                <WarnThresholdTab guildId={guildId} thresholds={initialThresholds} roleMap={roleMap} />
            )}
        </div>
    );
}