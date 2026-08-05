"use client";

import React, { ReactNode, useState, useTransition } from "react";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { deleteTempVoiceHubAction, saveTempVoiceHubAction } from "@/features/temp-voice/actions";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { MainConfigTab } from "@/features/temp-voice/components/FormTabs/MainConfigTab";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import { InterfaceMessageTab } from "@/features/temp-voice/components/FormTabs/InterfaceMessageTab";
import { TempVoiceHub } from "@/features/temp-voice/types";

interface HubFormProps {
    guildId: string;
    initialHub: TempVoiceHub;
    voiceChannels: Record<string, string>;
    textChannels: Record<string, string>;
    categories: Record<string, string>;
    onSaveSuccess: (savedHub: TempVoiceHub) => void;
    onDeleteSuccess: () => void;
}

type TabValue =
    | "GENERAL"
    | "INTERFACE_MESSAGE"

const TEMP_VOICE_TABS: TabItem<TabValue>[] = [
    { value: "GENERAL", label: "General" },
    { value: "INTERFACE_MESSAGE", label: "Interface Message" },
];

export function HubForm({
    guildId,
    initialHub,
    voiceChannels,
    textChannels,
    categories,
    onSaveSuccess,
    onDeleteSuccess,
}: HubFormProps): ReactNode {
    const [isDeleting, startDeleteTransition] = useTransition();
    const [activeTab, setActiveTab] = useState<TabValue>("GENERAL");

    const {
        config,
        isPending,
        isDirty,
        handleSave,
        handleCancel,
        handleChange,
    } = useConfigForm({
        initialConfig: initialHub,
        onSave: async (formValues: TempVoiceHub) => {
            try {
                const hub = await saveTempVoiceHubAction(guildId, formValues);
                onSaveSuccess(hub);
            } catch (error) {
                console.error(error);
            }
        },
    });

    // 1. Validation Logic: Requires trigger channel, category, and hub name
    const isValid = Boolean(
        config.name?.trim() &&
        config.hub_channel_id &&
        config.category_id
    );

    function handleDelete(): void {
        if (!initialHub.id) {
            onDeleteSuccess();
            return;
        }

        startDeleteTransition(async () => {
            try {
                await deleteTempVoiceHubAction(guildId, initialHub.id);
                onDeleteSuccess();
            } catch (error) {
                console.error(error);
            }
        });
    }

    return (
        <div>
            <div className="flex justify-between items-center pb-4">
                <h3 className="text-lg font-semibold">
                    {initialHub.id ? "Edit Voice Hub" : "Create Voice Hub"}
                </h3>
                <button
                    onClick={handleDelete}
                    disabled={isPending || isDeleting}
                    className="text-xs border border-red-500 hover:bg-red-500/10 px-3 py-1.5 rounded transition disabled:opacity-50 cursor-pointer"
                >
                    {isDeleting ? "Deleting..." : initialHub.id ? "Delete Hub" : "Cancel"}
                </button>
            </div>

            <Tabs tabs={TEMP_VOICE_TABS} activeTab={activeTab} onChange={tab => setActiveTab(tab)}/>

            {activeTab === "GENERAL" && (
                <MainConfigTab
                    config={config}
                    handleChange={handleChange}
                    channels={voiceChannels}
                    categories={categories}
                />
            )}

            {activeTab === "INTERFACE_MESSAGE" && (
                <InterfaceMessageTab
                    voiceConfig={config}
                    guildId={guildId}
                    channelMap={textChannels}
                    handleChange={handleChange}
                />
            )}

            {(isDirty && isValid) && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={() => {
                        if (isValid) handleSave();
                    }}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}