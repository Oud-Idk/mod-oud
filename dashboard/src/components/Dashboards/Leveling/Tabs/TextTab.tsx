import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { RangeSlider } from "@/components/Inputs/RangeSlider";
import { NumberInput } from "@/components/Inputs/NumberInput";
import { LevelingConfig } from "@/types/config";

interface TextTabProps {
    config: LevelingConfig;
    handleChange: (a: Partial<LevelingConfig>) => void;
}

export function TextTab({
    config,
    handleChange,
}: TextTabProps) {
    return (
        <div>
            <ToggleSwitch
                checked={config.text.enabled}
                onChange={(v) => handleChange({ text: { ...config.text, enabled: v } })}
                disabled={false}
                text="Enable Text Leveling"
            />
            {config.text.enabled && (
                <div className="space-y-4 mb-8">
                    <div>
                        <p className="text-lg">XP Range</p>
                        <RangeSlider
                            valMin={config.text.xp_range.min}
                            valMax={config.text.xp_range.max}
                            min={5}
                            max={50}
                            onChange={(val) => {
                                handleChange({ text: { ...config.text, xp_range: { min: val[0], max: val[1] } } })
                            }}
                        />
                    </div>
                    <div>
                        <p className="text-lg">Cooldown (Seconds)</p>
                        <NumberInput
                            value={config.text.xp_cooldown}
                            onChange={v => handleChange({ text: { ...config.text, xp_cooldown: v } })}
                        />
                    </div>
                    <ToggleSwitch
                        checked={config.text.xp_on_tickets}
                        onChange={(v) => handleChange({ text: { ...config.text, xp_on_tickets: v } })}
                        disabled={false}
                        text="Allow XP on Ticket"
                    />
                </div>
            )}
        </div>
    )
}