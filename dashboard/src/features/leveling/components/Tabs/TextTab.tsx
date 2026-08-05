import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { RangeSlider } from "@/components/ui/RangeSlider";
import { NumberInput } from "@/components/ui/NumberInput";
import { LevelingConfig } from "@/features/leveling/types";

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
                        <p className="text-lg">Cooldown (Seconds)</p>
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