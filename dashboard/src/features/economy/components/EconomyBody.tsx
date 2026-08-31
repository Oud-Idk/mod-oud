"use client";

import React, { JSX } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabItem } from "@/components/layout/Tabs";
import { EconomyConfig, EconomyItem, EconomyCategory, EconomyWorkMessage, EconomyLeaderboardEntry } from "@/features/economy/types";
import { EconomyGeneralSettingsTab } from "@/features/economy/components/tabs/EconomyGeneralSettingsTab";
import { EconomyItemsTab } from "@/features/economy/components/tabs/economy-items/EconomyItemsTab";
import { EconomyWorkMessagesTab } from "@/features/economy/components/tabs/EconomyWorkMessagesTab";
import { EconomyLeaderboardTab } from "@/features/economy/components/tabs/EconomyLeaderboardTab";

type EconomyTab = "general" | "items" | "work" | "leaderboard";

const TABS: TabItem<EconomyTab>[] = [
    { value: "general", label: "General Settings" },
    { value: "items", label: "Store Items" },
    { value: "work", label: "Work Messages" },
    { value: "leaderboard", label: "Leaderboard" },
];

interface EconomyBodyProps {
    economyConfig: EconomyConfig;
    items: EconomyItem[];
    categories: EconomyCategory[];
    workMessages: EconomyWorkMessage[];
    leaderboard: EconomyLeaderboardEntry[];
    activeItem: EconomyItem | null;
    roleMap: Record<string, string>;
    onSaveConfig: (config: EconomyConfig) => Promise<void>;
    onSaveItem: (item: EconomyItem) => Promise<EconomyItem>;
    onDeleteItem: (id: string) => Promise<boolean>;
    onSaveCategory: (category: EconomyCategory) => Promise<EconomyCategory>;
    onSyncWorkMessages: (messages: EconomyWorkMessage[]) => Promise<EconomyWorkMessage[]>;
    fetchMoreLeaderboard: (currentLowestTotal: number) => Promise<EconomyLeaderboardEntry[]>;
    guildId: string;
}

export function EconomyBody({
    economyConfig,
    items,
    categories,
    workMessages,
    leaderboard,
    activeItem,
    roleMap,
    onSaveConfig,
    onSaveItem,
    onDeleteItem,
    onSaveCategory,
    onSyncWorkMessages,
    fetchMoreLeaderboard,
    guildId,
}: EconomyBodyProps): JSX.Element {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Automatically switch to "items" tab if an item ID is present in query parameters
    const tabParam = searchParams.get("tab");
    const activeTab: EconomyTab =
        tabParam === "items" || searchParams.has("id")
            ? "items"
            : tabParam === "work"
              ? "work"
              : tabParam === "leaderboard"
                ? "leaderboard"
                : "general";

    const handleTabChange = (tab: EconomyTab): void => {
        if (tab === "general") {
            router.push(`/dashboard/${guildId}/economy`);
        } else if (tab === "items") {
            router.push(`/dashboard/${guildId}/economy?tab=items`);
        } else if (tab === "work") {
            router.push(`/dashboard/${guildId}/economy?tab=work`);
        } else {
            router.push(`/dashboard/${guildId}/economy?tab=leaderboard`);
        }
    };

    return (
        <div className="space-y-4">
            <Tabs
                tabs={TABS}
                activeTab={activeTab}
                onChange={handleTabChange}
            />

            {activeTab === "general" && (
                <EconomyGeneralSettingsTab
                    economyConfig={economyConfig}
                    onSave={onSaveConfig}
                />
            )}

            {activeTab === "items" && (
                <EconomyItemsTab
                    items={items}
                    categories={categories}
                    activeConfig={activeItem}
                    roleMap={roleMap}
                    onSave={onSaveItem}
                    onDelete={onDeleteItem}
                    onSaveCategory={onSaveCategory}
                    currencyName={economyConfig.currencyName}
                    guildId={guildId}
                />
            )}

            {activeTab === "work" && (
                <EconomyWorkMessagesTab
                    messages={workMessages}
                    onSync={onSyncWorkMessages}
                />
            )}

            {activeTab === "leaderboard" && (
                <EconomyLeaderboardTab
                    entries={leaderboard}
                    currencyName={economyConfig.currencyName}
                    fetchMore={fetchMoreLeaderboard}
                />
            )}
        </div>
    );
}