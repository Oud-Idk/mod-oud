"use client";

import React, { useState, useTransition } from "react";
import { TempVoiceHub } from "@/types/config";
import { useConfigForm } from "@/hooks/useConfigForm";
import { deleteTempVoiceHubAction, saveTempVoiceHubAction } from "@/actions/tempVoice";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { MainConfigTab } from "@/components/Dashboards/TempVoice/FormTabs/MainConfigTab";
import { TabItem, Tabs } from "@/components/Layout/Tabs";
import { InterfaceMessageTab } from "@/components/Dashboards/TempVoice/FormTabs/InterfaceMessageTab";

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
    | "general"
    | "interface_message"

const TEMP_VOICE_TABS: TabItem<TabValue>[] = [
    { value: "general", label: "General" },
    { value: "interface_message", label: "Interface Message" },
];

export function HubForm({
    guildId,
    initialHub,
    voiceChannels,
    textChannels,
    categories,
    onSaveSuccess,
    onDeleteSuccess,
}: HubFormProps) {
    const [isDeleting, startDeleteTransition] = useTransition();
    const [activeTab, setActiveTab] = useState<TabValue>("general");

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
            const res = await saveTempVoiceHubAction(guildId, formValues);
            if (res.success && res.hub) {
                onSaveSuccess(res.hub);
            }
        },
    });

    function handleDelete() {
        if (!initialHub.id) {
            onDeleteSuccess();
            return;
        }

        startDeleteTransition(async () => {
            const res = await deleteTempVoiceHubAction(guildId, initialHub.id);
            if (res.success) {
                onDeleteSuccess();
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
                    disabled={isPending}
                    className="text-xs border border-red-500 hover:bg-red-500/10 px-3 py-1.5 rounded transition disabled:opacity-50 cursor-pointer"
                >
                    {isDeleting ? "Deleting..." : initialHub.id ? "Delete Hub" : "Cancel"}
                </button>
            </div>

            <Tabs tabs={TEMP_VOICE_TABS} activeTab={activeTab} onChange={tab => setActiveTab(tab)}/>

            {activeTab === "general" && (
                <MainConfigTab
                    config={config} handleChange={handleChange} channels={voiceChannels} categories={categories}
                />
            )}

            {activeTab === "interface_message" && (
                <InterfaceMessageTab
                    voiceConfig={config} guildId={guildId} channelMap={textChannels}
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