"use client";

import { DiscordChannel } from "@/types";
import { JSX, useCallback, useMemo } from "react";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { MessageConfigEditor } from "@/components/MessageCreator/MessageConfigEditor";
import { DEFAULT_CONFIG } from "@/utils/embedTemplates";
import { LeaveConfig } from "@/types/config";
import { useConfigForm } from "@/hooks/useConfigForm";

interface LeaveBodyProps {
    leaveConfig: LeaveConfig;
    channels: DiscordChannel[];
    onSave: (config: LeaveConfig) => Promise<void>;
}

export function LeaveBody({
    leaveConfig,
    channels,
    onSave
}: LeaveBodyProps): JSX.Element {
    const normalizedLeaveConfig = useMemo(() => leaveConfig, [leaveConfig]);

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        resetKey,
        targetChannelIsEmpty,
        setIsEmpty,
        setTargetChannelIsEmpty,
        handleSave,
        handleCancel,
        handleChange,
    } = useConfigForm({
        initialConfig: normalizedLeaveConfig,
        onSave,
    });

    const handleEditorChange = useCallback((updated: any) => {
        handleChange({
            enabled: updated.enabled,
            channel_id: updated.channel_id || "",
            content: updated.content,
            embed: updated.embed,
            format: updated.format,
        });
    }, [handleChange]);

    const handleEmbedChange = useCallback((embed: any) => {
        setConfig((prev) => ({ ...prev, embed }));
    }, [setConfig]);

    return (
        <div>
            <MessageConfigEditor
                config={config}
                onChange={handleEditorChange}
                onEmbedChange={handleEmbedChange}
                channels={channels}
                disabled={isPending}
                toggleLabel="Send Public Message when User Leaves"
                embedTemplateConfig={DEFAULT_CONFIG}
                resetKey={`${resetKey}_public`}
                modeLabel="Message Mode (Leave)"
                placeholderText="{user.username} has left the server. Goodbye!"
                setIsEmpty={setIsEmpty}
                setTargetChannelIsEmpty={setTargetChannelIsEmpty}
                targetChannelIsEmpty={targetChannelIsEmpty}
            />

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}
        </div>
    );
}