import { NumberInput } from "@/components/NumberInput";
import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { LevelingConfig } from "@/types/config";
import ScopeSettings from "@/components/Dashboards/MessageFiltering/General/ScopeSettings";

export interface GeneralTabProps {
    config: LevelingConfig;
    handleChange: (a: Partial<LevelingConfig>) => void;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
}

export function GeneralTab({ config, handleChange, channelMap, roleMap }: GeneralTabProps) {
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
            <ScopeSettings
                scope={config.scope}
                onChange={v => handleChange({ scope: v })}
                channelMap={channelMap}
                roleMap={roleMap}
            />
        </div>
    )
}