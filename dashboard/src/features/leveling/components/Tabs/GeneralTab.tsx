import { NumberInput } from "@/components/ui/NumberInput";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import ScopeSettings from "@/features/message-filtering/components/General/ScopeSettings";
import { Dropdown, DropdownOption } from "@/components/ui/Dropdown";
import { JSX } from "react";
import { LevelingConfig, NotificationScope } from "@/features/leveling/types";
import { LEVEL_NOTIFY_CONFIG } from "@/features/leveling/builderConfigs";

import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { DiscordChannel } from "@/features/_shared/channels.types";
import { InputLabel } from "@/components/layout/InputLabel";
import Footer from "@/components/layout/Footer";

export interface GeneralTabProps {
    config: LevelingConfig;
    handleChange: (a: Partial<LevelingConfig>) => void;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
    channels: DiscordChannel[];
}

export function GeneralTab({ config, handleChange, channelMap, roleMap, channels }: GeneralTabProps): JSX.Element {
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

    return (
        <div className="space-y-2 max-w-md">
            <div>
                <InputLabel>Level Cap</InputLabel>
                <NumberInput
                    value={config.levelCap}
                    onChange={(v) => { handleChange({ levelCap: v }); }}
                />
                <Footer>Set to 0 to remove cap</Footer>
            </div>
            <div>
                <InputLabel>Choose where to send your level up message</InputLabel>
                <Dropdown
                    options={options}
                    value={config.notify.scope}
                    onChange={(val) => {
                        if (val !== null)
                            handleChange({
                                notify: {
                                    ...config.notify,
                                    scope: val,
                                },
                            });
                    }}
                    placeholder={"Choose where to send your level up message"}
                />
            </div>

            <ToggleSwitch
                checked={config.keepLevelOnLeave}
                onChange={(v) => { handleChange({ keepLevelOnLeave: v }); }}
                disabled={false}
                text="Preserve Level on user Leave"
            />

            {config.notify.scope !== "NONE" && (
                <MessageConfigEditor
                    config={{
                        format: config.notify.message.format,
                        content: config.notify.message.content,
                        embed: config.notify.message.embed,
                        channel_id: config.notify.channelId ?? "",
                    }}
                    onChange={(updatedConfig) =>{ 
                        handleChange({
                            notify: {
                                ...config.notify,
                                channelId: updatedConfig.channel_id ?? null,
                                message: {
                                    ...config.notify.message,
                                    content: updatedConfig.content ?? "",
                                    format: updatedConfig.format,
                                    embed: updatedConfig.embed ?? {},
                                },
                            },
                        }); }
                    }
                    onEmbedChange={(embed) =>{ 
                        handleChange({
                            notify: {
                                ...config.notify,
                                message: {
                                    ...config.notify.message,
                                    embed,
                                },
                            },
                        }); }
                    }
                    enableToggle={false}
                    embedTemplateConfig={LEVEL_NOTIFY_CONFIG}
                    channels={config.notify.scope === "SPECIFIED_CHANNEL" ? channels : undefined}
                />
            )}
            <ScopeSettings
                scope={config.scope}
                onChange={(v) => { handleChange({ scope: v }); }}
                channelMap={channelMap}
                roleMap={roleMap}
            />
        </div>
    );
}