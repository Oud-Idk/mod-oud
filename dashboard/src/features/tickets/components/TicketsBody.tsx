"use client";

import { useState } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import TicketingTab from "@/features/tickets/components/Tabs/TicketingTab";
import InitialMessageTab from "@/features/tickets/components/Tabs/InitialMessageTab";
import GeneralsTab from "@/features/tickets/components/Tabs/GeneralsTab";
import HistoryTab from "@/features/tickets/components/Tabs/HistoryTab";
import { TicketConfig } from "@/features/tickets/types";
import { useTicketConfig } from "@/features/tickets/hooks/useTicketConfig";
import { DiscordChannel } from "@/features/_shared/channels.types";
import { GenericMessageConfig } from "@/features/_shared/message-creator/types";

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
    const {
        config,
        setConfig,
        isDirty,
        isPending,
        isProcessingAction,
        isWarnThresholdInvalid,
        status,
        validationError,
        handleSave,
        handleCancel,
        handleSendLiveMessage,
        handleDeleteLiveMessage
    } = useTicketConfig(ticketConfig, onSave, onSendTicketMessage, onDeleteTicketMessage);

    const [activeTab, setActiveTab] = useState<TabValue>("TICKETING");

    const handleWelcomeChange = (updated: GenericMessageConfig) => {
        setConfig((prev) => ({
            ...prev,
            welcomeMessage: {
                format: updated.format ?? prev.welcomeMessage.format,
                content: updated.content ?? prev.welcomeMessage.content,
                embed: updated.embed ?? prev.welcomeMessage.embed,
                enabled: updated.enabled ?? prev.welcomeMessage.enabled ?? false,
            },
        }));
    };

    return (
        <div className="flex flex-col">
            <Tabs tabs={TICKETS_TABS} activeTab={activeTab} onChange={setActiveTab} />

            {validationError && (
                <div className="p-3 mb-4 text-sm text-danger bg-danger-subtle rounded-md">
                    {validationError}
                </div>
            )}

            {activeTab === "TICKETING" && (
                <TicketingTab
                    status={status}
                    config={config}
                    setConfig={setConfig}
                    channels={channels}
                    disabled={isPending}
                    categoryMap={categoryMap}
                    roleMap={roleMap}
                    onDeletePanel={handleDeleteLiveMessage}
                    onPostPanel={handleSendLiveMessage}
                    isProcessing={isProcessingAction}
                    isDirty={isDirty}
                />
            )}

            {activeTab === "WELCOME" && (
                <InitialMessageTab
                    config={config}
                    onChange={handleWelcomeChange}
                    onEmbedChange={(embed) =>
                        setConfig((prev) => ({
                            ...prev,
                            welcomeMessage: { ...prev.welcomeMessage, embed },
                        }))
                    }
                    disabled={isPending}
                    resetKey={0}
                    isEmpty={() => {}}
                />
            )}

            {activeTab === "GENERAL" && (
                <GeneralsTab
                    config={config}
                    onChange={setConfig}
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