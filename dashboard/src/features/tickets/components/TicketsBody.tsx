"use client";

import { useState } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import TicketingTab from "./Tabs/TicketingTab";
import InitialMessageTab from "./Tabs/InitialMessageTab";
import GeneralsTab from "./Tabs/GeneralsTab";
import HistoryTab from "./Tabs/HistoryTab";
import { useTicketConfig } from "../hooks/useTicketConfig";
import type { TicketConfig } from "../types";
import type { DiscordChannel } from "@/features/_shared/channels.types";
import type { GenericMessageConfig } from "@/features/_shared/message-creator/types";

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
    onDeleteTicketMessage,
}: TicketsBodyProps) {
    const {
        config,
        setConfig,
        isDirty,
        isPending,
        isProcessingAction,
        isWarnThresholdInvalid,
        handleSave,
        handleCancel,
        handleSendLiveMessage,
        handleDeleteLiveMessage,
    } = useTicketConfig(ticketConfig, onSave, onSendTicketMessage, onDeleteTicketMessage);

    const [activeTab, setActiveTab] = useState<TabValue>("TICKETING");

    const handleWelcomeChange = (updated: GenericMessageConfig) => {
        setConfig((prev) => ({
            ...prev,
            welcomeMessage: {
                enabled: updated.enabled ?? prev.welcomeMessage.enabled ?? false,
                message: {
                    format: updated.format ?? prev.welcomeMessage.message.format,
                    content: updated.content ?? prev.welcomeMessage.message.content,
                    embed: updated.embed ?? prev.welcomeMessage.message.embed,
                },
            },
        }));
    };

    return (
        <div className="flex flex-col">
            <Tabs tabs={TICKETS_TABS} activeTab={activeTab} onChange={setActiveTab} />

            {activeTab === "TICKETING" && (
                <TicketingTab
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