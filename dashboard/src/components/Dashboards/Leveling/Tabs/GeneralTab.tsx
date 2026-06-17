import { NumberInput } from "@/components/NumberInput";
import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { LevelingConfig } from "@/types/config";
import ScopeSettings from "@/components/Dashboards/MessageFiltering/General/ScopeSettings";
import { Dropdown, DropdownOption } from "@/components/Dropdown";
import { MessageConfigEditor } from "@/components/MessageCreator/MessageConfigEditor";
import { LEVEL_NOTIFY_CONFIG } from "@/utils/embedTemplates";
import { DiscordChannel } from "@/types";

export interface GeneralTabProps {
    config: LevelingConfig;
    handleChange: (a: Partial<LevelingConfig>) => void;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
    channels: DiscordChannel[];
}

export function GeneralTab({ config, handleChange, channelMap, roleMap, channels }: GeneralTabProps) {
    const options: DropdownOption[] = [
        {
            value: "none",
            label: "Off",
        },
        {
            value: "current_channel",
            label: "Message's Current Channel",
        },
        {
            value: "specified_channel",
            label: "Specified Channel",
        },
        {
            value: "dm",
            label: "DMs",
        },
    ]

    return (
        <div className="space-y-4">
            <div>
                <p className="text-lg">Level Cap</p>
                <NumberInput
                    value={config.level_cap} onChange={v => handleChange({ level_cap: v })}
                />
            </div>
            <ToggleSwitch
                enabled={config.keep_level_on_leave}
                onChange={(v) => handleChange({ keep_level_on_leave: v })}
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
                            scope: val as "current_channel" | "specified_channel" | "dm" | "none"
                        }
                    })
                }} placeholder={"Choose where to send your level up message"} className="max-w-sm"
                />
            </div>
            {config.notify.scope !== "none" && (
                <MessageConfigEditor
                    config={{ ...config.notify, enabled: true }} // assumed true cuz this is case of not none
                    onChange={updatedConfig => handleChange({
                        notify: {
                            ...config.notify,
                            content: updatedConfig.content,
                            format: updatedConfig.format,
                            embed: updatedConfig.embed,
                            channel_id: updatedConfig.channel_id
                        },
                    })}
                    onEmbedChange={embed => handleChange({ notify: { ...config.notify, embed } })}
                    enableToggle={false}
                    embedTemplateConfig={LEVEL_NOTIFY_CONFIG}
                    channels={config.notify.scope === "specified_channel" ? channels : undefined}
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