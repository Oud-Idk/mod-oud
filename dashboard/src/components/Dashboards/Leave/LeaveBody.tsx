"use client";

import { DiscordChannel } from "@/types";
import { JSX, useCallback, useMemo, useState, useTransition } from "react";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { isDeepEqual } from "@/utils/embed";
import { GenericMessageConfig, MessageConfigEditor } from "@/components/MessageCreator/MessageConfigEditor";
import { DEFAULT_CONFIG } from "@/utils/embedTemplates";
import { LeaveConfig } from "@/types/config";

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
    const normalizedLeaveConfig = useMemo((): LeaveConfig => {
        return leaveConfig;
    }, [leaveConfig]);

    const [config, setConfig] = useState<LeaveConfig>(normalizedLeaveConfig);
    const [isPending, startTransition] = useTransition();
    const [resetKey, setResetKey] = useState(0);

    const isDirty = !isDeepEqual(config, normalizedLeaveConfig);

    const handleSave = () => {
        startTransition(async () => {
            await onSave(config);
        });
    };

    const handleCancel = () => {
        setConfig(normalizedLeaveConfig);
        setResetKey((prev) => prev + 1);
    };

    const handleChange = useCallback((updated: GenericMessageConfig) => {
        setConfig((prev) => ({
            ...prev,
            enabled: updated.enabled,
            channel_id: updated.channel_id || "",
            content: updated.content,
            embed: updated.embed,
            format: updated.format,
        }));
    }, []);

    // Stabilize the embed change callback so it doesn't recreate on every render
    const handleEmbedChange = useCallback((embed: any) => {
        setConfig((prev) => ({ ...prev, embed }));
    }, []);

    return (
        <div>
            <MessageConfigEditor
                config={config}
                onChange={handleChange}
                onEmbedChange={handleEmbedChange}
                channels={channels}
                disabled={isPending}
                toggleLabel="Send Public Message when User Leaves"
                embedTemplateConfig={DEFAULT_CONFIG}
                resetKey={`${resetKey}_public`}
                modeLabel="Message Mode (Leave)"
                placeholderText="{user.username} has left the server. Goodbye!"
            />

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}
        </div>
    );
}