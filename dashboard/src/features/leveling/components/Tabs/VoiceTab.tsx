import { ToggleSwitch } from "@/components/ui/inputs/ToggleSwitch";
import { RangeSlider } from "@/components/ui/inputs/RangeSlider";
import { LevelingConfig } from "@/features/leveling/types";
import { InputLabel } from "@/components/layout/InputLabel";
import Footer from "@/components/layout/Footer";
import { JSX } from "react";

interface VoiceTabProps {
    config: LevelingConfig;
    handleChange: (a: Partial<LevelingConfig>) => void;
}

export function VoiceTab({
    config,
    handleChange,
}: VoiceTabProps): JSX.Element {
    return (
        <div className="max-w-md">
            <ToggleSwitch
                checked={config.voice.enabled}
                onChange={(v) => { handleChange({ voice: { ...config.voice, enabled: v, } }); }}
                disabled={false}
                text="Enable Voice Leveling"
                className="mb-0"
            />

            {config.voice.enabled && (
                <div className="space-y-2">
                    <div>
                        <InputLabel>XP Range per Minute</InputLabel>
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

            <Footer className="mt-1">There must be another human in the same VC.</Footer>
        </div>
    )
}