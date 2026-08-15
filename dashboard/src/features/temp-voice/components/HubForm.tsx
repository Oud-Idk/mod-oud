"use client";

import React, { useMemo, useState, useTransition, useCallback, JSX } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { TabItem, Tabs } from "@/components/layout/Tabs";
import { Button } from "@/components/ui/Button";
import { deleteTempVoiceHubAction, saveTempVoiceHubAction } from "../actions";
import { saveTempVoiceHubInputSchema, type TempVoiceHub } from "../types";
import { InterfaceMessageTab } from "./FormTabs/InterfaceMessageTab";
import { MainConfigTab } from "./FormTabs/MainConfigTab";
import { toast } from "sonner";

interface HubFormProps {
    guildId: string;
    initialHub: TempVoiceHub;
    voiceChannels: Record<string, string>;
    textChannels: Record<string, string>;
    categories: Record<string, string>;
    onSaveSuccess: (savedHub: TempVoiceHub) => void;
    onDeleteSuccess: () => void;
}

type TabValue = "GENERAL" | "INTERFACE_MESSAGE";

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
}: HubFormProps): JSX.Element {
    const [isDeleting, startDeleteTransition] = useTransition();
    const [activeTab, setActiveTab] = useState<TabValue>("GENERAL");

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        handleSave,
        handleCancel,
    } = useConfigForm<TempVoiceHub>({
        initialConfig: initialHub,
        onSave: async (formValues: TempVoiceHub) => {
            const hub = await saveTempVoiceHubAction(guildId, formValues);
            onSaveSuccess(hub);
        },
    });

    const handleChange = useCallback((updated: Partial<TempVoiceHub>) => {
        setConfig((prev) => ({ ...prev, ...updated }));
    }, [setConfig]);

    const validationResult = useMemo(() => {
        return saveTempVoiceHubInputSchema.safeParse(config);
    }, [config]);

    const hasValidationErrors = !validationResult.success;

    const onValidatedSave = (): void => {
        if (hasValidationErrors) return;
        handleSave();
    };

    function handleDelete(): void {
        if (!initialHub.id) {
            onDeleteSuccess();
            return;
        }

        startDeleteTransition(async () => {
            try {
                await deleteTempVoiceHubAction(guildId, initialHub.id);
                toast.success("Voice hub deleted successfully");
                onDeleteSuccess();
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to delete voice hub");
            }
        });
    }

    return (
        <div className="space-y-2">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-semibold text-foreground">
                    {initialHub.id ? "Edit Voice Hub" : "Create Voice Hub"}
                </h3>
                <Button
                    variant="danger"
                    onClick={handleDelete}
                    disabled={isPending || isDeleting}
                >
                    {isDeleting ? "Deleting..." : initialHub.id ? "Delete Hub" : "Cancel"}
                </Button>
            </div>

            {hasValidationErrors && (
                <div className="p-3 rounded-lg border border-warning/30 bg-warning-subtle text-warning-foreground text-xs font-medium flex items-center gap-2">
                    <span>⚠️</span>
                    <span>
                        {validationResult.error.issues[0].message}
                    </span>
                </div>
            )}

            <Tabs tabs={TEMP_VOICE_TABS} activeTab={activeTab} onChange={setActiveTab} />

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

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={onValidatedSave}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}