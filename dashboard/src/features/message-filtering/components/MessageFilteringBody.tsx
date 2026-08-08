"use client";

import { TabItem, Tabs } from "@/components/layout/Tabs";
import { ComponentType, JSX, useMemo, useState, useCallback } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { OffensiveMessagesTab } from "@/features/message-filtering/components/Tabs/OffensiveMessagesTab";
import { ServerInvitesTab } from "@/features/message-filtering/components/Tabs/ServerInvitesTab";
import { ExternalURLsTab } from "@/features/message-filtering/components/Tabs/ExternalURLsTab";
import { ExcessiveCapsTab } from "@/features/message-filtering/components/Tabs/ExcessiveCapsTab";
import { ExcessiveEmojisTab } from "@/features/message-filtering/components/Tabs/ExcessiveEmojisTab";
import { ExcessiveSpoilersTab } from "@/features/message-filtering/components/Tabs/ExcessiveSpoilersTab";
import { ExcessiveMentionsTab } from "@/features/message-filtering/components/Tabs/ExcessiveMentionsTab";
import { ZalgoTab } from "@/features/message-filtering/components/Tabs/ZalgoTab";
import { AntiSpamFilterTab } from "@/features/message-filtering/components/Tabs/AntiSpamFilterTab";
import { GlobalScopeTab } from "@/features/message-filtering/components/Tabs/GlobalScope";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { BadWordTab } from "@/features/message-filtering/components/Tabs/BadWordsTab";
import { CryptoAddressTab } from "@/features/message-filtering/components/Tabs/CryptoAddressTab";
import {
    BadWordRuleset,
    MessageFilteringConfig,
    SaveableBadWordRuleset,
    messageFilteringConfigSchema
} from "@/features/message-filtering/types";

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
    | "crypto_addresses"
    | "global_scope";

const FILTERING_TABS: TabItem<TabValue>[] = [
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
    { value: "crypto_addresses", label: "Crypto Addresses" },
    { value: "global_scope", label: "Global Scope" },
];

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
    crypto_addresses: CryptoAddressTab,
    global_scope: GlobalScopeTab,
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
    const normalizedConfig = useMemo(() => messageFilteringConfig, [messageFilteringConfig]);

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        handleSave,
        handleCancel,
    } = useConfigForm({
        initialConfig: normalizedConfig,
        onSave,
    });

    const handleChange = useCallback((updated: Partial<MessageFilteringConfig>) => {
        setConfig((prev) => ({ ...prev, ...updated }));
    }, [setConfig]);

    const onValidatedSave = (): void => {
        messageFilteringConfigSchema.parse(config);
        handleSave();
    };

    const ActiveTabComponent = activeTab !== "bad_words" ? TAB_MAP[activeTab] : null;

    return (
        <div>
            <Tabs tabs={FILTERING_TABS} activeTab={activeTab} onChange={setActiveTab}/>

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
                            config={config}
                            handleChange={handleChange}
                            channelMap={channelMap}
                            roleMap={roleMap}
                        />
                    )
                )}
            </div>

            {isDirty && activeTab !== "bad_words" && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={onValidatedSave}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}