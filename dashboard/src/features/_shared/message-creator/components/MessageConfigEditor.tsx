import { GenericMessageConfig } from "@/features/_shared/message-creator/types";
import { DiscordEmbed } from "@/features/_shared/embed";
import { BuilderConfig } from "@/features/_shared/builderConfig";
import { JSX, ReactNode, SetStateAction, useEffect } from "react";
import { ToggleSwitch } from "@/components/ui/inputs/ToggleSwitch";
import { ChannelSelector } from "@/features/_shared/message-creator/components/ChannelSelector";
import { MessageModeSelector } from "@/features/_shared/message-creator/components/MessageModeSelector";
import { PlaintextEditor } from "@/features/_shared/message-creator/components/PlaintextEditor";

import EmbedBuilder from "@/features/_shared/message-creator/components/EmbedBuilder";
import { DiscordChannel } from "@/features/_shared/channels.types";
import { MessagePreview } from "@/features/_shared/message-creator/components/MessagePreview";

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
    targetChannelIsEmpty?: boolean;
    setTargetChannelIsEmpty?: (value: SetStateAction<boolean>) => void;
    noChannels?: boolean;
    customFields?: ReactNode;
}

export function MessageConfigEditor({
    config,
    onChange,
    toggleLabel,
    embedTemplateConfig,
    channels,
    disabled = false,
    resetKey = 0,
    modeLabel,
    placeholderText,
    enableToggle = true,
    setTargetChannelIsEmpty,
    noChannels = false,
    customFields: CustomFields,
}: MessageConfigEditorProps): JSX.Element {
    const isEnabled = config.enabled ?? true;
    const isChannelError = isEnabled && (config.channel_id === null || config.channel_id === undefined);

    // Handle target channel emptiness validation
    useEffect(() => {
        if (!noChannels && setTargetChannelIsEmpty) {
            if (!isEnabled) {
                setTargetChannelIsEmpty(false);
            } else {
                const normalizedChannelId = config.channel_id ?? "";
                setTargetChannelIsEmpty(normalizedChannelId.trim() === "");
            }
        }
    }, [config.channel_id, isEnabled, noChannels, setTargetChannelIsEmpty]);

    return (
        <>
            {(enableToggle && config.enabled !== undefined) && (
                <ToggleSwitch
                    checked={isEnabled}
                    disabled={disabled}
                    onChange={(checked) => { onChange({ ...config, enabled: checked }); }}
                    text={toggleLabel}
                />
            )}

            {isEnabled && (
                <>
                    {!noChannels && channels && (
                        <ChannelSelector
                            channels={channels}
                            value={config.channel_id ?? null}
                            disabled={disabled}
                            onChange={(value) => { onChange({ ...config, channel_id: value }); }}
                            error={isChannelError}
                        />
                    )}

                    {CustomFields}

                    <MessageModeSelector
                        format={config.format}
                        label={modeLabel}
                        disabled={disabled}
                        onChange={(format) => { onChange({ ...config, format }); }}
                    />

                    {config.format === "TEXT" ? (
                        <div className="flex flex-row gap-8">
                            <PlaintextEditor
                                value={config.content ?? ""}
                                placeholder={placeholderText}
                                placeholderConfig={embedTemplateConfig}
                                disabled={disabled}
                                onChange={(val) => { onChange({ ...config, content: val }); }}
                            />
                            <MessagePreview config={embedTemplateConfig} plaintext={config.content ?? undefined}/>
                        </div>
                    ) : (
                        <EmbedBuilder
                            placeholderConfig={embedTemplateConfig}
                            key={resetKey.toString()}
                            setEmbedState={embed => { onChange({ ...config, embed: embed }); }}
                            config={embedTemplateConfig}
                            initialEmbedState={config.embed}
                        />
                    )}
                </>
            )}
        </>
    );
}