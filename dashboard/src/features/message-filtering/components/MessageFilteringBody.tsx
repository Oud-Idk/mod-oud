"use client";

import { TabItem, Tabs } from "@/components/layout/Tabs";
import { JSX, useMemo, useState, useCallback } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { OffensiveMessagesTab } from "@/features/message-filtering/components/Tabs/OffensiveMessagesTab";
import { ToxicMessagesTab } from "@/features/message-filtering/components/Tabs/ToxicMessagesTab";
import { ServerInvitesTab } from "@/features/message-filtering/components/Tabs/ServerInvitesTab";
import { ExternalURLsTab, ExternalURLsTabProps } from "@/features/message-filtering/components/Tabs/ExternalURLsTab";
import { ExcessiveCapsTab } from "@/features/message-filtering/components/Tabs/ExcessiveCapsTab";
import { ExcessiveEmojisTab } from "@/features/message-filtering/components/Tabs/ExcessiveEmojisTab";
import { ExcessiveSpoilersTab } from "@/features/message-filtering/components/Tabs/ExcessiveSpoilersTab";
import { ExcessiveMentionsTab } from "@/features/message-filtering/components/Tabs/ExcessiveMentionsTab";
import { ZalgoTab } from "@/features/message-filtering/components/Tabs/ZalgoTab";
import { AntiSpamFilterTab } from "@/features/message-filtering/components/Tabs/AntiSpamFilterTab";
import { CrossChannelSpamTab } from "@/features/message-filtering/components/Tabs/CrossChannelSpamTab";
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
import { toast } from "sonner";

type TabValue =
    | "BAD_WORDS"
    | "OFFENSIVE_MESSAGES"
    | "TOXIC_MESSAGES"
    | "SERVER_INVITES"
    | "EXTERNAL_LINKS"
    | "EXCESSIVE_CAPS"
    | "EXCESSIVE_SPOILERS"
    | "EXCESSIVE_EMOJIS"
    | "EXCESSIVE_MENTIONS"
    | "ZALGO"
    | "ANTI_SPAM"
    | "CROSS_CHANNEL_SPAM"
    | "CRYPTO_ADDRESSES"
    | "GLOBAL_SCOPE";

const FILTERING_TABS: TabItem<TabValue>[] = [
    { value: "BAD_WORDS", label: "Bad Words" },
    { value: "OFFENSIVE_MESSAGES", label: "Offensive Messages" },
    { value: "TOXIC_MESSAGES", label: "Toxic Messages" },
    { value: "SERVER_INVITES", label: "External Server Invites" },
    { value: "EXTERNAL_LINKS", label: "External URLs" },
    { value: "EXCESSIVE_CAPS", label: "Excessive Caps" },
    { value: "EXCESSIVE_EMOJIS", label: "Excessive Emojis" },
    { value: "EXCESSIVE_SPOILERS", label: "Excessive Spoilers" },
    { value: "EXCESSIVE_MENTIONS", label: "Excessive Mentions" },
    { value: "ZALGO", label: "Zalgo" },
    { value: "ANTI_SPAM", label: "Anti Spam" },
    { value: "CROSS_CHANNEL_SPAM", label: "Cross Channel Spam" },
    { value: "CRYPTO_ADDRESSES", label: "Crypto Addresses" },
    { value: "GLOBAL_SCOPE", label: "Global Scope" },
];

type TabSignature = ({ config, handleChange, channelMap, roleMap }: ExternalURLsTabProps) => JSX.Element;

const TAB_MAP: Record<Exclude<TabValue, "BAD_WORDS">, TabSignature> = {
    OFFENSIVE_MESSAGES: OffensiveMessagesTab,
    TOXIC_MESSAGES: ToxicMessagesTab,
    SERVER_INVITES: ServerInvitesTab,
    EXTERNAL_LINKS: ExternalURLsTab,
    EXCESSIVE_CAPS: ExcessiveCapsTab,
    EXCESSIVE_EMOJIS: ExcessiveEmojisTab,
    EXCESSIVE_SPOILERS: ExcessiveSpoilersTab,
    EXCESSIVE_MENTIONS: ExcessiveMentionsTab,
    ZALGO: ZalgoTab,
    ANTI_SPAM: AntiSpamFilterTab,
    CROSS_CHANNEL_SPAM: CrossChannelSpamTab,
    CRYPTO_ADDRESSES: CryptoAddressTab,
    GLOBAL_SCOPE: GlobalScopeTab,
};

interface MessageFilteringBodyProps {
    messageFilteringConfig: MessageFilteringConfig;
    badWordRulesets: BadWordRuleset[];
    activeRuleset: BadWordRuleset | null;
    onSaveRuleset: (ruleset: SaveableBadWordRuleset) => Promise<BadWordRuleset>;
    onDeleteRuleset: (id: string) => Promise<void>;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
    onSave: (messageFilteringConfig: MessageFilteringConfig) => Promise<void>;
    heavyFeaturesEnabled: boolean;
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
    heavyFeaturesEnabled,
}: MessageFilteringBodyProps): JSX.Element {
    const [selectedTab, setSelectedTab] = useState<TabValue>("BAD_WORDS");
    const normalizedConfig = useMemo(() => messageFilteringConfig, [messageFilteringConfig]);

    const visibleTabs = useMemo(
        () => (heavyFeaturesEnabled
            ? FILTERING_TABS
            : FILTERING_TABS.filter((tab) => tab.value !== "TOXIC_MESSAGES")),
        [heavyFeaturesEnabled],
    );

    // The selected tab can be hidden by the flag, so derive the one actually shown.
    const activeTab = visibleTabs.some((tab) => tab.value === selectedTab) ? selectedTab : "BAD_WORDS";

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
        setConfig(({ ...config, ...updated }));
    }, [setConfig, config]);

    const onValidatedSave = (): void => {
        const result = messageFilteringConfigSchema.safeParse(config);
        if (!result.success) {
            toast.error(result.error.issues[0].message);
            return;
        }
        handleSave();
    };

    const ActiveTabComponent = activeTab !== "BAD_WORDS" ? TAB_MAP[activeTab] : null;

    return (
        <div>
            <Tabs tabs={visibleTabs} activeTab={activeTab} onChange={setSelectedTab}/>

            <div className="tab-content">
                {activeTab === "BAD_WORDS" ? (
                    <BadWordTab
                        rulesets={badWordRulesets}
                        activeRuleset={activeRuleset}
                        channelMap={channelMap ?? {}}
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

            {isDirty && activeTab !== "BAD_WORDS" && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={onValidatedSave}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}