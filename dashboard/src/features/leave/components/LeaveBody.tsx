"use client";

import { JSX, useCallback, useMemo } from "react";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { LeaveConfig } from "@/features/leave/types";
import { DiscordEmbed } from "@/features/_shared/embed";
import { LEAVE_CONFIG } from "@/features/leave/builderConfigs";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { DiscordChannel } from "@/features/_shared/channels.types";

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

    const handleEmbedChange = useCallback((embed: DiscordEmbed) => {
        setConfig((prev) => ({
            ...prev,
            message: { ...prev.message, embed },
        }));
    }, [setConfig]);

    const editorConfig = useMemo(() => ({
        enabled: config.enabled,
        channel_id: config.channelId ?? "",
        format: config.message.format,
        content: config.message.content,
        embed: config.message.embed,
    }), [config]);

    return (
        <div>
            <MessageConfigEditor
                config={editorConfig}
                onChange={(updated) =>
                    handleChange({
                        enabled: updated.enabled ?? config.enabled,
                        channelId: updated.channel_id || null,
                        message: {
                            ...config.message,
                            format: updated.format ?? config.message.format,
                            content: updated.content ?? "",
                            embed: updated.embed ?? {},
                        },
                    })
                }
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
                    handleCancel={handleCancel}
                    handleSave={handleSave}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}