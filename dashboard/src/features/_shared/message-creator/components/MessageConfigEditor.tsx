import { GenericMessageConfig } from "@/features/_shared/message-creator/types";
import { DiscordEmbed } from "@/features/_shared/embed";
import { BuilderConfig } from "@/features/_shared/builderConfig";
import { DiscordChannel } from "@/features/_shared/channels";
import { JSX, ReactNode, SetStateAction, useEffect } from "react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { ChannelSelector } from "@/features/_shared/message-creator/components/ChannelSelector";
import { MessageModeSelector } from "@/features/_shared/message-creator/components/MessageModeSelector";
import { PlaintextEditor } from "@/features/_shared/message-creator/components/PlaintextEditor";

import EmbedBuilder from "@/features/_shared/message-creator/components/EmbedBuilder";

interface MessageConfigEditorProps {
    config: GenericMessageConfig;
    onChange: (updatedConfig: GenericMessageConfig) => void;
    onEmbedChange?: (embed: DiscordEmbed) => void;
    toggleLabel?: string;
    enableToggle?: boolean;
    embedTemplateConfig: BuilderConfig;
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
    const isEnabled = config.enabled ?? true;

    // Reset emptiness status when the message configuration is disabled
    useEffect(() => {
        if (!isEnabled) {
            setIsEmpty(false);
        }
    }, [isEnabled, setIsEmpty]);

    // Handle target channel emptiness validation
    useEffect(() => {
        if (!noChannels && setTargetChannelIsEmpty) {
            if (!isEnabled) {
                setTargetChannelIsEmpty(false);
            } else {
                const normalizedChannelId = config.channel_id || "";
                setTargetChannelIsEmpty(normalizedChannelId.trim() === "");
            }
        }
    }, [config.channel_id, isEnabled, noChannels, setTargetChannelIsEmpty]);

    return (
        <>
            {enableToggle && (
                <ToggleSwitch
                    checked={isEnabled}
                    disabled={disabled}
                    onChange={(checked) => onChange({ ...config, enabled: checked })}
                    text={toggleLabel}
                />
            )}

            {isEnabled && (
                <>
                    {!noChannels && channels && (
                        <ChannelSelector
                            channels={channels}
                            value={config.channel_id || ""}
                            disabled={disabled}
                            onChange={(value) => onChange({ ...config, channel_id: value })}
                            className={targetChannelIsEmpty ? "border-red-700 dark:border-red-300" : ""}
                        />
                    )}
                    {CustomFields}

                    <MessageModeSelector
                        format={config.format}
                        label={modeLabel}
                        disabled={disabled}
                        onChange={(format) => onChange({ ...config, format })}
                    />

                    {config.format === "TEXT" ? (
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
                            placeholderConfig={embedTemplateConfig}
                            key={`${resetKey}`}
                            setEmbedState={embed => onChange({ ...config, embed: embed })}
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