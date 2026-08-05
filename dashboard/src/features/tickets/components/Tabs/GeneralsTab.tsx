import { NumberInput } from "@/components/ui/NumberInput";
import { TicketConfig } from "@/features/tickets/types";

interface GeneralsTabProps {
    config: TicketConfig;
    onChange: (config: TicketConfig) => void;
    warnThresholdInvalid: boolean;
}

export default function GeneralsTab({
    config,
    onChange,
    warnThresholdInvalid,
}: GeneralsTabProps) {
    const updateConfig = (updates: Partial<TicketConfig>) => {
        onChange({ ...config, ...updates });
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                    <h4 className="text-xl font-medium">Auto-Close Inactive Tickets</h4>
                    <p className="text-sm text-neutral-400">
                        Configure when inactive tickets receive a warning, and when they are closed. </p>
                </div>

                <div className="flex flex-col gap-4">
                    <NumberInput
                        label="Warn Threshold (Minutes)"
                        value={config.warnThreshold}
                        onChange={(v) => updateConfig({ warnThreshold: v })}
                        min={5}
                        max={10080}
                        className={warnThresholdInvalid ? "opacity-40 grayscale pointer-events-auto transition-all" : "transition-all"}
                    />
                    <NumberInput
                        label="Close Threshold (Minutes)"
                        value={config.deleteThreshold}
                        onChange={(v) => updateConfig({ deleteThreshold: v })}
                        min={5}
                        max={10080}
                    />
                    <NumberInput
                        label="Bump Close Button Every (Messages)"
                        value={config.bumpEvery}
                        onChange={(v) => updateConfig({ bumpEvery: v })}
                        min={0}
                        max={100}
                    />
                </div>

                {warnThresholdInvalid && (
                    <p className="text-xs text-red-500 font-semibold italic">
                        Warning threshold cannot be higher than the close threshold. </p>
                )}
            </div>
        </div>
    );
}