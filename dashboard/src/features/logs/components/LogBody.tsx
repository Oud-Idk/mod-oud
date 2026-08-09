"use client";

import { JSX, useState } from "react";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import { AutomodTab } from "./Tabs/AutomodTab";
import { MemberActivityTab } from "./Tabs/MemberActivityTab";
import { ModerationTab } from "./Tabs/ModerationTab";

type TabValue = "AUTOMOD" | "ACTIVITY" | "MODERATION";

const LOG_TABS: TabItem<TabValue>[] = [
    { value: "AUTOMOD", label: "Automod" },
    { value: "ACTIVITY", label: "Member Activity" },
    { value: "MODERATION", label: "Moderation" }, // <-- Added tab item
];

interface LogBodyProps {
    guildId: string;
}

export function LogBody({ guildId }: LogBodyProps): JSX.Element {
    const [activeTab, setActiveTab] = useState<TabValue>("AUTOMOD");

    return (
        <div className="space-y-4">
            <Tabs
                tabs={LOG_TABS} activeTab={activeTab} onChange={(v) => setActiveTab(v)}
            />

            <div className="mt-4">
                {activeTab === "AUTOMOD" && <AutomodTab guildId={guildId}/>}
                {activeTab === "ACTIVITY" && <MemberActivityTab guildId={guildId}/>}
                {activeTab === "MODERATION" && <ModerationTab guildId={guildId}/>}
            </div>
        </div>
    );
}

