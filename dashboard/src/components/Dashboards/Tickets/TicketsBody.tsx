"use client";

import { TicketConfig } from "@/types/config";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { DiscordChannel } from "@/types";
import { useConfigForm } from "@/hooks/useConfigForm";
import { TabItem, Tabs } from "@/components/Tabs";
import TicketingTab from "@/components/Dashboards/Tickets/Tabs/TicketingTab";
import InitialMessageTab from "@/components/Dashboards/Tickets/Tabs/InitialMessageTab";
import GeneralsTab from "@/components/Dashboards/Tickets/Tabs/GeneralsTab";
import { useTicketing } from "@/hooks/useTicketing";
import { useState } from "react";

interface TicketsBodyProps {
    categoryMap: Record<string, string>;
    roleMap: Record<string, string>;
    channels: DiscordChannel[];
    ticketConfig: TicketConfig;
    onSave: (config: TicketConfig) => Promise<void>;
    onSendTicketMessage: (channelId: string) => Promise<string | void>;
    onDeleteTicketMessage: (channelId: string, messageId: string) => Promise<void>;
}

type TabValue = "ticketing" | "welcome" | "general";

const MODERATION_DM_TABS: TabItem<TabValue>[] = [
    { value: "ticketing", label: "Ticketing" },
    { value: "welcome", label: "Initial Message" },
    { value: "general", label: "General" },
];

export function TicketsBody({
    categoryMap = {},
    roleMap = {},
    channels = [],
    ticketConfig,
    onSave,
    onSendTicketMessage,
    onDeleteTicketMessage
}: TicketsBodyProps) {
    const {
        config,
        setConfig,
        isPending,
        resetKey,
        isEmpty,
        setIsEmpty,
        targetChannelIsEmpty,
        setTargetChannelIsEmpty,
        handleSave: hookHandleSave,
        handleCancel: hookHandleCancel,
    } = useConfigForm<TicketConfig>({
        initialConfig: ticketConfig,
        onSave,
    });

    const {
        isProcessing,
        status,
        setIsWelcomeEmpty,
        isWarnThresholdInvalid,
        isDirty,
        handleSave,
        handleCancel,
        handleWelcomeChange,
        handleWelcomeEmbedChange,
        handleWarnThresholdChange,
        handleDeleteThresholdChange,
        handleBumpEveryChange,
        handleSendLiveMessage,
        handleDeleteLiveMessage
    } = useTicketing(config, ticketConfig, isEmpty, targetChannelIsEmpty, hookHandleSave, hookHandleCancel, setConfig, onSendTicketMessage, onDeleteTicketMessage);

    const [activeTab, setActiveTab] = useState<TabValue>("ticketing");

    return (
        <div>
            <Tabs tabs={MODERATION_DM_TABS} activeTab={activeTab} onChange={setActiveTab}/>

            {activeTab === "ticketing" && (
                <TicketingTab
                    config={config}
                    setConfig={setConfig}
                    channels={channels}
                    disabled={isPending}
                    resetKey={resetKey}
                    setIsEmpty={setIsEmpty}
                    targetChannelIsEmpty={targetChannelIsEmpty}
                    setTargetChannelIsEmpty={setTargetChannelIsEmpty}
                    categoryMap={categoryMap}
                    roleMap={roleMap}
                    onDeletePanel={handleDeleteLiveMessage}
                    onPostPanel={handleSendLiveMessage}
                    isProcessing={isProcessing}
                    isDirty={isDirty}
                />
            )}
            {activeTab === "welcome" && (
                <InitialMessageTab
                    status={status}
                    config={config}
                    onChange={handleWelcomeChange}
                    onEmbedChange={handleWelcomeEmbedChange}
                    disabled={isPending}
                    resetKey={resetKey}
                    isEmpty={setIsWelcomeEmpty}
                />
            )}
            {activeTab === "general" && (
                <GeneralsTab
                    config={config}
                    onChange={handleWarnThresholdChange}
                    warnThresholdInvalid={isWarnThresholdInvalid}
                    onChange1={handleDeleteThresholdChange}
                    onChange2={handleBumpEveryChange}
                />
            )}

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}
        </div>
    );
}