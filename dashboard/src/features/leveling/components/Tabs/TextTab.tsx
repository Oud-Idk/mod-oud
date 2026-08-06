import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { RangeSlider } from "@/components/ui/RangeSlider";
import { NumberInput } from "@/components/ui/NumberInput";
import { LevelingConfig } from "@/features/leveling/types";
import { InputLabel } from "@/components/layout/InputLabel";

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
                className="mb-0"
            />
            {config.text.enabled && (
                <div className="space-y-2 mb-8 max-w-md">
                    <div>
                        <InputLabel>XP Range</InputLabel>
                        <RangeSlider
                            valMin={config.text.xpRange.min}
                            valMax={config.text.xpRange.max}
                            min={5}
                            max={50}
                            onChange={(val) => {
                                handleChange({ text: { ...config.text, xpRange: { min: val[0], max: val[1] } } })
                            }}
                        />
                    </div>
                    <div>
                        <InputLabel>Cooldown (Seconds)</InputLabel>
                        <NumberInput
                            value={config.text.xpCooldown}
                            onChange={v => handleChange({ text: { ...config.text, xpCooldown: v ?? 0 } })}
                        />
                    </div>
                    <ToggleSwitch
                        checked={config.text.xpOnTickets}
                        onChange={(v) => handleChange({ text: { ...config.text, xpOnTickets: v } })}
                        disabled={false}
                        text="Allow XP on Ticket"
                    />
                </div>
            )}
        </div>
    )
}