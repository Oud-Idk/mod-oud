"use client";

import { useState } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import TicketingTab from "@/features/tickets/components/Tabs/TicketingTab";
import InitialMessageTab from "@/features/tickets/components/Tabs/InitialMessageTab";
import GeneralsTab from "@/features/tickets/components/Tabs/GeneralsTab";
import HistoryTab from "@/features/tickets/components/Tabs/HistoryTab";
import { TicketConfig } from "@/features/tickets/types";
import { useTicketing } from "@/features/tickets/hooks/useTicketing";
import { DiscordChannel } from "@/features/_shared/channels.types";

interface TicketsBodyProps {
    guildId: string;
    categoryMap: Record<string, string>;
    roleMap: Record<string, string>;
    channels: DiscordChannel[];
    ticketConfig: TicketConfig;
    onSave: (config: TicketConfig) => Promise<void>;
    onSendTicketMessage: (channelId: string) => Promise<string | void>;
    onDeleteTicketMessage: (channelId: string, messageId: string) => Promise<void>;
}

type TabValue = "TICKETING" | "WELCOME" | "GENERAL" | "HISTORY";

const TICKETS_TABS: TabItem<TabValue>[] = [
    { value: "TICKETING", label: "Ticketing" },
    { value: "WELCOME", label: "Initial Message" },
    { value: "GENERAL", label: "General" },
    { value: "HISTORY", label: "History" },
];

export function TicketsBody({
    guildId,
    categoryMap = {},
    roleMap = {},
    channels = [],
    ticketConfig,
    onSave,
    onSendTicketMessage,
    onDeleteTicketMessage
}: TicketsBodyProps) {
    // Form state hook handling initial config & changes
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

    // Ticketing domain hook
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
        handleTicketConfigChange,
        handleSendLiveMessage,
        handleDeleteLiveMessage
    } = useTicketing(
        config,
        ticketConfig,
        isEmpty,
        targetChannelIsEmpty,
        hookHandleSave,
        hookHandleCancel,
        setConfig,
        onSendTicketMessage,
        onDeleteTicketMessage
    );

    const [activeTab, setActiveTab] = useState<TabValue>("TICKETING");

    return (
        <div className="flex flex-col">
            <Tabs tabs={TICKETS_TABS} activeTab={activeTab} onChange={setActiveTab} />

            {activeTab === "TICKETING" && (
                <TicketingTab
                    status={status}
                    config={config}
                    setConfig={setConfig}
                    channels={channels}
                    disabled={isPending}
                    resetKey={resetKey}
                    isEmpty={isEmpty}
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

            {activeTab === "WELCOME" && (
                <InitialMessageTab
                    config={config}
                    onChange={handleWelcomeChange}
                    onEmbedChange={handleWelcomeEmbedChange}
                    disabled={isPending}
                    resetKey={resetKey}
                    isEmpty={setIsWelcomeEmpty}
                />
            )}

            {activeTab === "GENERAL" && (
                <GeneralsTab
                    config={config}
                    onChange={handleTicketConfigChange}
                    warnThresholdInvalid={isWarnThresholdInvalid}
                />
            )}

            {activeTab === "HISTORY" && (
                <HistoryTab guildId={guildId} />
            )}

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={handleSave}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}