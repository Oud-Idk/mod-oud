import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { JSX } from "react";
import { Pad } from "@/components/Pad";
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
}: MessageConfigEditorProps): JSX.Element {
    return (
        <>
            {enableToggle && <>
                <ToggleSwitch
                    enabled={config.enabled}
                    disabled={disabled}
                    onChange={(checked) => onChange({ ...config, enabled: checked })}
                    text={toggleLabel}
                />
                <Pad/>
            </>}

            {config.enabled && (
                <>
                    {channels && (
                        <>
                            <ChannelSelector
                                channels={channels}
                                value={config.channel_id || ""}
                                disabled={disabled}
                                onChange={(value) => onChange({ ...config, channel_id: value })}
                            />
                        </>
                    )}

                    <MessageModeSelector
                        format={config.format}
                        label={modeLabel}
                        disabled={disabled}
                        onChange={(format) => onChange({ ...config, format })}
                    />

                    {config.format === "text" ? (
                        <PlaintextEditor
                            value={config.content || ""}
                            placeholder={placeholderText} // Passed here
                            placeholderConfig={embedTemplateConfig} // Reuses config structure
                            disabled={disabled}
                            onChange={(val) => onChange({ ...config, content: val })}
                        />
                    ) : (
                        <EmbedBuilder
                            key={`${resetKey}`}
                            setEmbedState={onEmbedChange}
                            config={embedTemplateConfig}
                            initialEmbedState={config.embed}
                        />
                    )}
                </>
            )}
        </>
    );
}