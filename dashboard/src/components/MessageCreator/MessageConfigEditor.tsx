import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { JSX } from "react";
import { Pad } from "@/components/Pad";
import { ChannelSelector } from "@/components/Dashboards/General/ChannelSelector";
import { MessageModeSelector } from "@/components/MessageCreator/MessageModeSelector";
import { PlaintextEditor } from "@/components/MessageCreator/PlaintextEditor";
import GenericEmbedBuilder from "@/components/Embed/GenericEmbedBuilder";
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
    toggleLabel: string;
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
    placeholderText, // Deconstructed here
}: MessageConfigEditorProps): JSX.Element {
    return (
        <>
            <ToggleSwitch
                enabled={config.enabled}
                disabled={disabled}
                onChange={(checked) => onChange({ ...config, enabled: checked })}
                text={toggleLabel}
            />
            <Pad/>

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
                            <Pad/>
                        </>
                    )}

                    <MessageModeSelector
                        format={config.format}
                        label={modeLabel}
                        disabled={disabled}
                        onChange={(format) => onChange({ ...config, format })}
                    />
                    <Pad/>

                    {config.format === "text" ? (
                        <PlaintextEditor
                            value={config.content || ""}
                            placeholder={placeholderText} // Passed here
                            placeholderConfig={embedTemplateConfig} // Reuses config structure
                            disabled={disabled}
                            onChange={(val) => onChange({ ...config, content: val })}
                        />
                    ) : (
                        <GenericEmbedBuilder
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