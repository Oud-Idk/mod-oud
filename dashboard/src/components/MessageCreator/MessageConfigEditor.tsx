import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { JSX, ReactNode, SetStateAction, useEffect } from "react";
import { ChannelSelector } from "@/components/Dashboards/General/ChannelSelector";
import { MessageModeSelector } from "@/components/MessageCreator/MessageModeSelector";
import { PlaintextEditor } from "@/components/MessageCreator/PlaintextEditor";
import EmbedBuilder from "@/components/Embed/EmbedBuilder";
import { DiscordChannel } from "@/types";

export interface GenericMessageConfig {
    enabled: boolean;
    channel_id?: string;
    content: string;
    embed: any;
    format: "text" | "embed";
}

interface MessageConfigEditorProps {
    config: GenericMessageConfig;
    onChange: (updatedConfig: GenericMessageConfig) => void;
    onEmbedChange: (embed: any) => void; // ← add this
    toggleLabel?: string;
    enableToggle?: boolean;
    embedTemplateConfig: any;
    channels?: DiscordChannel[];
    disabled?: boolean;
    resetKey?: string | number;
    modeLabel?: string;
    placeholderText?: string;
    setIsEmpty: (value: SetStateAction<boolean>) => void;
    targetChannelIsEmpty?: boolean;
    setTargetChannelIsEmpty?: (value: SetStateAction<boolean>) => void;
    noChannels?: boolean;
    customFields?: ReactNode;
}

export function MessageConfigEditor({
    config,
    onChange,
    onEmbedChange,
    toggleLabel,
    embedTemplateConfig,
    channels,
    disabled = false,
    resetKey = 0,
    modeLabel,
    placeholderText,
    enableToggle = true,
    setIsEmpty,
    targetChannelIsEmpty,
    setTargetChannelIsEmpty,
    noChannels = false,
    customFields: CustomFields,
}: MessageConfigEditorProps): JSX.Element {
    if (!noChannels) {
        useEffect(() => {
            if (setTargetChannelIsEmpty) {
                const normalizedChannelId = config.channel_id || "";
                setTargetChannelIsEmpty(normalizedChannelId.trim() === "");
            }
        }, [config.channel_id]);
    }

    return (
        <>
            {enableToggle && (
                <>
                    <ToggleSwitch
                        enabled={config.enabled}
                        disabled={disabled}
                        onChange={(checked) => onChange({ ...config, enabled: checked })}
                        text={toggleLabel}
                    />
                </>
            )}

            {config.enabled && (
                <>
                    {!noChannels && channels && (
                        <ChannelSelector
                            channels={channels}
                            value={config.channel_id || ""}
                            disabled={disabled}
                            onChange={(value) => onChange({ ...config, channel_id: value })}
                            className={targetChannelIsEmpty ? "ring-2 ring-red-500 rounded-md" : ""}
                        />
                    )}
                    {CustomFields}

                    <MessageModeSelector
                        format={config.format}
                        label={modeLabel}
                        disabled={disabled}
                        onChange={(format) => onChange({ ...config, format })}
                    />

                    {config.format === "text" ? (
                        <PlaintextEditor
                            value={config.content || ""}
                            placeholder={placeholderText}
                            placeholderConfig={embedTemplateConfig}
                            disabled={disabled}
                            onChange={(val) => onChange({ ...config, content: val })}
                            setIsEmpty={setIsEmpty}
                        />
                    ) : (
                        <EmbedBuilder
                            key={`${resetKey}`}
                            setEmbedState={onEmbedChange}
                            config={embedTemplateConfig}
                            initialEmbedState={config.embed}
                            setIsEmpty={setIsEmpty}
                        />
                    )}
                </>
            )}
        </>
    );
}