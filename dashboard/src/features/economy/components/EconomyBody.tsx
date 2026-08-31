"use client";

import React, { JSX } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Tabs, TabItem } from "@/components/layout/Tabs";
import { EconomyConfig, EconomyItem } from "@/features/economy/types";
import { EconomyGeneralSettingsTab } from "@/features/economy/components/tabs/EconomyGeneralSettingsTab";
import { EconomyItemsTab } from "@/features/economy/components/tabs/economy-items/EconomyItemsTab";

type EconomyTab = "general" | "items";

const TABS: TabItem<EconomyTab>[] = [
    { value: "general", label: "General Settings" },
    { value: "items", label: "Store Items" },
];

interface EconomyBodyProps {
    economyConfig: EconomyConfig;
    items: EconomyItem[];
    activeItem: EconomyItem | null;
    roleMap: Record<string, string>;
    onSaveConfig: (config: EconomyConfig) => Promise<void>;
    onSaveItem: (item: EconomyItem) => Promise<EconomyItem>;
    onDeleteItem: (id: string) => Promise<boolean>;
    guildId: string;
}

export function EconomyBody({
    economyConfig,
    items,
    activeItem,
    roleMap,
    onSaveConfig,
    onSaveItem,
    onDeleteItem,
    guildId,
}: EconomyBodyProps): JSX.Element {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Automatically switch to "items" tab if an item ID is present in query parameters
    const tabParam = searchParams.get("tab");
    const activeTab: EconomyTab =
        tabParam === "items" || searchParams.has("id") ? "items" : "general";

    const handleTabChange = (tab: EconomyTab): void => {
        if (tab === "general") {
            router.push(`/dashboard/${guildId}/economy`);
        } else {
            router.push(`/dashboard/${guildId}/economy?tab=items`);
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
                    activeConfig={activeItem}
                    roleMap={roleMap}
                    onSave={onSaveItem}
                    onDelete={onDeleteItem}
                    currencyName={economyConfig.currencyName}
                    guildId={guildId}
                />
            )}
        </div>
    );
}