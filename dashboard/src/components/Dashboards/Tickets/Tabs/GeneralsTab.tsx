import { TicketConfig } from "@/types/config";
import { NumberInput } from "@/components/NumberInput";

export default function GeneralsTab(props: {
    config: TicketConfig,
    onChange: (v: number) => void,
    warnThresholdInvalid: boolean,
    onChange1: (v: number) => void,
    onChange2: (v: number) => void
}) {
    return <div>
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                    <h4 className="text-xl font-medium">Auto-Close Inactive Tickets</h4>
                    <p className="text-sm">
                        Configure when inactive tickets receive a warning, and when they are closed. </p>
                </div>

                <div className="flex flex-col gap-4">
                    <NumberInput
                        label="Warn Threshold (Minutes)"
                        value={props.config.warn_threshold}
                        onChange={props.onChange}
                        min={5}
                        max={10080}
                        className={props.warnThresholdInvalid ? "opacity-40 grayscale pointer-events-auto transition-all" : "transition-all"}
                    />
                    <NumberInput
                        label="Close Threshold (Minutes)"
                        value={props.config.delete_threshold}
                        onChange={props.onChange1}
                        min={5}
                        max={10080}
                    />
                    <NumberInput
                        label="Bump Close Button Every (Messages)"
                        value={props.config.bump_every}
                        onChange={props.onChange2}
                        min={0}
                        max={100}
                    />
                </div>

                {props.warnThresholdInvalid && (
                    <p className="text-xs text-red-500 font-semibold italic">
                        Warning threshold cannot be higher than the close threshold. </p>
                )}
            </div>
        </div>
    </div>
}