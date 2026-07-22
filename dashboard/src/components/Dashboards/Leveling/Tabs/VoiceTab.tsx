import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { LevelingConfig } from "@/types/db/config";
import { RangeSlider } from "@/components/Inputs/RangeSlider";

interface VoiceTabProps {
    config: LevelingConfig;
    handleChange: (a: Partial<LevelingConfig>) => void;
}

export function VoiceTab({
    config,
    handleChange,
}: VoiceTabProps) {
    return (
        <div>
            <ToggleSwitch
                checked={config.voice.enabled}
                onChange={(v) => handleChange({ voice: { ...config.voice, enabled: v, } })}
                disabled={false}
                text="Enable Voice Leveling"
            />
            <p className="mt-1.5 mb-3">There must be another human in the same VC to increase XP.</p>

            {config.voice.enabled && (
                <div className="space-y-2">
                    <div>
                        <p className="text-lg">XP Range per Minute</p>
                        <RangeSlider
                            valMin={config.voice.xpRange.min}
                            valMax={config.voice.xpRange.max}
                            min={15}
                            max={100}
                            onChange={(val) => {
                                handleChange({ voice: { ...config.voice, xpRange: { min: val[0], max: val[1] } } })
                            }}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}