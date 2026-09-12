import { JSX } from "react";
import { NumberInput } from "@/components/ui/inputs/NumberInput";
import { ToggleSwitch } from "@/components/ui/inputs/ToggleSwitch";
import ScopeSettings from "@/features/message-filtering/components/General/ScopeSettings";
import { Dropdown, DropdownOption } from "@/components/ui/inputs/Dropdown";
import { LevelingConfig, NotificationTarget } from "@/features/leveling/types";
import { LEVEL_NOTIFY_CONFIG } from "@/features/leveling/builderConfigs";
import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { DiscordChannel } from "@/features/_shared/channels.types";
import { InputLabel } from "@/components/layout/InputLabel";
import Footer from "@/components/layout/Footer";

export type NotificationScope = NotificationTarget["scope"];

export interface GeneralTabProps {
    config: LevelingConfig;
    handleChange: (a: Partial<LevelingConfig>) => void;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
    channels: DiscordChannel[];
}

export function GeneralTab({
    config,
    handleChange,
    channelMap,
    roleMap,
    channels,
}: GeneralTabProps): JSX.Element {
    const options: DropdownOption<NotificationScope>[] = [
        {
            value: "NONE",
            label: "Off",
        },
        {
            value: "CURRENT_CHANNEL",
            label: "Message's Current Channel",
        },
        {
            value: "SPECIFIED_CHANNEL",
            label: "Specified Channel",
        },
        {
            value: "DM",
            label: "DMs",
        },
    ];

    const DEFAULT_TEXT = "Congratulations {user}, you have leveled up to **level {level}**! 🎉";

    const handleScopeChange = (val: NotificationScope | null): void => {
        if (val === null) return;

        const currentMessage = config.notify.message;
        const safeMessage = {
            ...currentMessage,
            content:
                currentMessage.format === "TEXT" && currentMessage.content.trim() === ""
                    ? DEFAULT_TEXT
                    : currentMessage.content,
        };

        if (val === "SPECIFIED_CHANNEL") {
            const existingChannelId =
                config.notify.scope === "SPECIFIED_CHANNEL" ? config.notify.channelId : "";

            handleChange({
                notify: {
                    scope: "SPECIFIED_CHANNEL",
                    channelId: existingChannelId !== "" ? existingChannelId : (channels[0]?.id ?? ""),
                    message: safeMessage,
                },
            });
        } else {
            handleChange({
                notify: {
                    scope: val,
                    message: safeMessage,
                },
            });
        }
    };

    const currentChannelId =
        config.notify.scope === "SPECIFIED_CHANNEL" ? config.notify.channelId : "";

    return (
        <div className="space-y-2 max-w-xl">
            <div>
                <InputLabel>Level Cap</InputLabel>
                <NumberInput
                    value={config.levelCap}
                    onChange={(v) => {
                        handleChange({ levelCap: v ?? 0 });
                    }}
                />
                <Footer>Set to 0 to remove cap</Footer>
            </div>

            <div>
                <InputLabel>Choose where to send your level up message</InputLabel>
                <Dropdown
                    options={options}
                    value={config.notify.scope}
                    onChange={handleScopeChange}
                    placeholder="Choose where to send your level up message"
                />
            </div>

            <ToggleSwitch
                checked={config.keepLevelOnLeave}
                onChange={(v) => {
                    handleChange({ keepLevelOnLeave: v });
                }}
                disabled={false}
                text="Preserve Level on user Leave"
            />

            {config.notify.scope !== "NONE" && (
                <MessageConfigEditor
                    config={{
                        format: config.notify.message.format,
                        content: config.notify.message.content,
                        embed: config.notify.message.embed,
                        channel_id: currentChannelId,
                    }}
                    onChange={(updatedConfig) => {
                        if (config.notify.scope === "SPECIFIED_CHANNEL") {
                            handleChange({
                                notify: {
                                    scope: "SPECIFIED_CHANNEL",
                                    channelId: updatedConfig.channel_id ?? "",
                                    message: {
                                        ...config.notify.message,
                                        content: updatedConfig.content ?? "",
                                        format: updatedConfig.format,
                                        embed: updatedConfig.embed ?? {},
                                    },
                                },
                            });
                        } else {
                            handleChange({
                                notify: {
                                    scope: config.notify.scope,
                                    message: {
                                        ...config.notify.message,
                                        content: updatedConfig.content ?? "",
                                        format: updatedConfig.format,
                                        embed: updatedConfig.embed ?? {},
                                    },
                                },
                            });
                        }
                    }}
                    onEmbedChange={(embed) => {
                        handleChange({
                            notify: {
                                ...config.notify,
                                message: {
                                    ...config.notify.message,
                                    embed,
                                },
                            },
                        });
                    }}
                    enableToggle={false}
                    embedTemplateConfig={LEVEL_NOTIFY_CONFIG}
                    channels={config.notify.scope === "SPECIFIED_CHANNEL" ? channels : undefined}
                />
            )}

            <ScopeSettings
                scope={config.scope}
                onChange={(v) => {
                    handleChange({ scope: v });
                }}
                channelMap={channelMap}
                roleMap={roleMap}
            />
        </div>
    );
}