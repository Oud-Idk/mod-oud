// LogBody.tsx
"use client";

import { useState } from "react";
import { TabItem, Tabs } from "@/components/Layout/Tabs";
import { AutomodTab } from "./Tabs/AutomodTab";
import { MemberActivityTab } from "./Tabs/MemberActivityTab";
import { ModerationTab } from "./Tabs/ModerationTab"; // <-- Added import

type TabValue = "automod" | "activity" | "moderation"; // <-- Added "moderation"

const LOG_TABS: TabItem<TabValue>[] = [
    { value: "automod", label: "Automod" },
    { value: "activity", label: "Member Activity" },
    { value: "moderation", label: "Moderation" }, // <-- Added tab item
];

interface LogBodyProps {
    guildId: string;
}

export function LogBody({ guildId }: LogBodyProps) {
    const [activeTab, setActiveTab] = useState<TabValue>("automod");

    return (
        <div className="space-y-4">
            <Tabs
                tabs={LOG_TABS} activeTab={activeTab} onChange={(v) => setActiveTab(v as TabValue)}
            />

            <div className="mt-4">
                {activeTab === "automod" && <AutomodTab guildId={guildId}/>}
                {activeTab === "activity" && <MemberActivityTab guildId={guildId}/>}
                {activeTab === "moderation" && <ModerationTab guildId={guildId}/>} {/* <-- Added condition */}
            </div>
        </div>
    );
}