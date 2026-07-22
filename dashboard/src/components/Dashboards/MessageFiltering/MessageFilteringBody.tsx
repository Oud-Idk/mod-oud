"use client";

import { TabItem, Tabs } from "@/components/Layout/Tabs";
import { ComponentType, JSX, useMemo, useState } from "react";
import { MessageFilteringConfig } from "@/types/db/config/messageFiltering";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { OffensiveMessagesTab } from "@/components/Dashboards/MessageFiltering/Tabs/OffensiveMessagesTab";
import { ServerInvitesTab } from "@/components/Dashboards/MessageFiltering/Tabs/ServerInvitesTab";
import { ExternalURLsTab } from "@/components/Dashboards/MessageFiltering/Tabs/ExternalURLsTab";
import { ExcessiveCapsTab } from "@/components/Dashboards/MessageFiltering/Tabs/ExcessiveCapsTab";
import { ExcessiveEmojisTab } from "@/components/Dashboards/MessageFiltering/Tabs/ExcessiveEmojisTab";
import { ExcessiveSpoilersTab } from "@/components/Dashboards/MessageFiltering/Tabs/ExcessiveSpoilersTab";
import { ExcessiveMentionsTab } from "@/components/Dashboards/MessageFiltering/Tabs/ExcessiveMentionsTab";
import { ZalgoTab } from "@/components/Dashboards/MessageFiltering/Tabs/ZalgoTab";
import { AntiSpamFilterTab } from "@/components/Dashboards/MessageFiltering/Tabs/AntiSpamFilterTab";
import { GlobalScopeTab } from "@/components/Dashboards/MessageFiltering/Tabs/GlobalScope";
import { useConfigForm } from "@/hooks/useConfigForm";

// Import your custom Bad Words components
import { BadWordTab } from "@/components/Dashboards/MessageFiltering/Tabs/BadWordsTab";
import { BadWordRuleset } from "@/types/db";

type TabValue =
    | "bad_words"
    | "offensive_messages"
    | "server_invites"
    | "external_links"
    | "excessive_caps"
    | "excessive_spoilers"
    | "excessive_emojis"
    | "excessive_mentions"
    | "zalgo"
    | "anti_spam"
    | "global_scope";

const WELCOME_TABS: TabItem<TabValue>[] = [
    { value: "bad_words", label: "Bad Words" },
    { value: "offensive_messages", label: "Offensive Messages" },
    { value: "server_invites", label: "External Server Invites" },
    { value: "external_links", label: "External URLs" },
    { value: "excessive_caps", label: "Excessive Caps" },
    { value: "excessive_emojis", label: "Excessive Emojis" },
    { value: "excessive_spoilers", label: "Excessive Spoilers" },
    { value: "excessive_mentions", label: "Excessive Mentions" },
    { value: "zalgo", label: "Zalgo" },
    { value: "anti_spam", label: "Anti Spam" },
    { value: "global_scope", label: "Global Scope" },
];

type SaveableBadWordRuleset = Omit<BadWordRuleset, "createdAt" | "updatedAt" | "guildId" | "id"> & {
    id?: string;
};

interface MessageFilteringBodyProps {
    messageFilteringConfig: MessageFilteringConfig;
    badWordRulesets: BadWordRuleset[];
    activeRuleset: BadWordRuleset | null;
    onSaveRuleset: (ruleset: SaveableBadWordRuleset) => Promise<any>;
    onDeleteRuleset: (id: string) => Promise<void>;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
    onSave: (messageFilteringConfig: MessageFilteringConfig) => Promise<void>;
}

const TAB_MAP: Record<Exclude<TabValue, "bad_words">, ComponentType<any>> = {
    offensive_messages: OffensiveMessagesTab,
    server_invites: ServerInvitesTab,
    external_links: ExternalURLsTab,
    excessive_caps: ExcessiveCapsTab,
    excessive_emojis: ExcessiveEmojisTab,
    excessive_spoilers: ExcessiveSpoilersTab,
    excessive_mentions: ExcessiveMentionsTab,
    zalgo: ZalgoTab,
    anti_spam: AntiSpamFilterTab,
    global_scope: GlobalScopeTab,
};

export function MessageFilteringBody({
    messageFilteringConfig,
    badWordRulesets,
    activeRuleset,
    onSaveRuleset,
    onDeleteRuleset,
    channelMap,
    roleMap,
    onSave,
}: MessageFilteringBodyProps): JSX.Element {
    const [activeTab, setActiveTab] = useState<TabValue>("bad_words");

    const normalizedConfig = useMemo(() => {
        return {
            ...messageFilteringConfig,
        };
    }, [messageFilteringConfig]);

    const {
        config,
        isPending,
        isDirty,
        handleSave,
        handleCancel,
        handleChange,
    } = useConfigForm({
        initialConfig: normalizedConfig,
        onSave,
    });

    const ActiveTabComponent = activeTab !== "bad_words" ? TAB_MAP[activeTab] : null;

    return (
        <div>
            <Tabs tabs={WELCOME_TABS} activeTab={activeTab} onChange={setActiveTab}/>

            <div className="tab-content">
                {activeTab === "bad_words" ? (
                    <BadWordTab
                        rulesets={badWordRulesets}
                        activeRuleset={activeRuleset}
                        channelMap={channelMap || {}}
                        roleMap={roleMap}
                        onSave={onSaveRuleset}
                        onDelete={onDeleteRuleset}
                    />
                ) : (
                    ActiveTabComponent && (
                        <ActiveTabComponent
                            config={config} handleChange={handleChange} channelMap={channelMap} roleMap={roleMap}
                        />
                    )
                )}
            </div>

            {isDirty && activeTab !== "bad_words" && (
                <SavePopup handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}/>
            )}
        </div>
    );
}