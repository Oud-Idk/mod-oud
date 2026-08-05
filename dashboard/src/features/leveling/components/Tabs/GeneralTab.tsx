import { NumberInput } from "@/components/ui/NumberInput";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import ScopeSettings from "@/features/message-filtering/components/General/ScopeSettings";
import { Dropdown, DropdownOption } from "@/components/ui/Dropdown";
import { SetStateAction } from "react";
import { LevelingConfig, NotificationScope } from "@/features/leveling/types";
import { LEVEL_NOTIFY_CONFIG } from "@/features/leveling/builderConfigs";

import { MessageConfigEditor } from "@/features/_shared/message-creator/components/MessageConfigEditor";
import { DiscordChannel } from "@/features/_shared/channels.types";

export interface GeneralTabProps {
    config: LevelingConfig;
    handleChange: (a: Partial<LevelingConfig>) => void;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
    channels: DiscordChannel[];
    setIsEmpty: (value: SetStateAction<boolean>) => void;
}

export function GeneralTab({ config, handleChange, channelMap, roleMap, channels, setIsEmpty }: GeneralTabProps) {
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
    ]

    return (
        <div className="space-y-4">
            <div>
                <p className="text-lg">Level Cap</p>
                <p className="text-sm">Set 0 to remove cap</p>
                <NumberInput
                    value={config.levelCap} onChange={v => handleChange({ levelCap: v })}
                />
            </div>
            <ToggleSwitch
                checked={config.keepLevelOnLeave}
                onChange={(v) => handleChange({ keepLevelOnLeave: v })}
                disabled={false}
                text="Preserve Level on user Leave"
            />
            <div>
                <p className="text-xl mb-1">Choose where to send your level up message</p>
                <Dropdown
                    options={options} value={config.notify.scope} onChange={(val) => {
                    if (val) handleChange({
                        notify: {
                            ...config.notify,
                            scope: val
                        }
                    })
                }} placeholder={"Choose where to send your level up message"} className="max-w-xs"
                />
            </div>
            {config.notify.scope !== "NONE" && (
                <MessageConfigEditor
                    config={{ ...config.notify, enabled: true }} // assumed true cuz this is case of not none
                    onChange={updatedConfig => handleChange({
                        notify: {
                            ...config.notify,
                            content: updatedConfig.content ?? "",
                            format: updatedConfig.format,
                            embed: updatedConfig.embed ?? {},
                            channelId: updatedConfig.channel_id ?? ""
                        },
                    })}
                    onEmbedChange={embed => handleChange({ notify: { ...config.notify, embed } })}
                    enableToggle={false}
                    embedTemplateConfig={LEVEL_NOTIFY_CONFIG}
                    channels={config.notify.scope === "SPECIFIED_CHANNEL" ? channels : undefined}
                    setIsEmpty={setIsEmpty}
                />
            )}
            <ScopeSettings
                scope={config.scope}
                onChange={v => handleChange({ scope: v })}
                channelMap={channelMap}
                roleMap={roleMap}
            />
        </div>
    )
}