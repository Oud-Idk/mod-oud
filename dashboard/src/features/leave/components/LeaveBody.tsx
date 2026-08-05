"use client";

import { JSX, useCallback, useMemo } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { LeaveConfig } from "@/features/leave/types";
import { DiscordEmbed } from "@/features/_shared/embed";
import { WELCOME_CONFIG } from "@/features/welcome/builderConfigs";
import { LEAVE_CONFIG } from "@/features/leave/builderConfigs";

import { DiscordChannel } from "@/features/_shared/channels";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";

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

    const handleEditorChange = useCallback((updated: LeaveConfig) => {
        handleChange({
            enabled: updated.enabled,
            channelId: updated.channelId || "",
            content: updated.content,
            embed: updated.embed,
            format: updated.format,
        });
    }, [handleChange]);

    const handleEmbedChange = useCallback((embed: DiscordEmbed) => {
        setConfig((prev) => ({ ...prev, embed }));
    }, [setConfig]);

    return (
        <div>
            <MessageConfigEditor
                config={config}
                onChange={v => handleEditorChange({...v, channelId: v.channel_id ?? "", enabled: v.enabled ?? false, content: v.content ?? "", embed: v.embed ?? {}})}
                onEmbedChange={handleEmbedChange}
                channels={channels}
                disabled={isPending}
                toggleLabel="Send Public Message when User Leaves"
                embedTemplateConfig={LEAVE_CONFIG}
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