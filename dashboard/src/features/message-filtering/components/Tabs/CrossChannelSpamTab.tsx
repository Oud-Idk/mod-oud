import { PercentSlider } from "@/components/ui/inputs/PercentSlider";
import { NumberInput } from "@/components/ui/inputs/NumberInput";
import { ToggleSwitch } from "@/components/ui/inputs/ToggleSwitch";
import { MessageFilteringConfig, PriorCopies } from "@/features/message-filtering/types";

import { createFilterUpdater } from "@/features/message-filtering/filterUpdater";
import { FilterLayoutWrapper } from "@/features/message-filtering/components/FilterLayout";
import { JSX } from "react";

interface CrossChannelSpamTabProps {
    config: MessageFilteringConfig;
    handleChange: (config: MessageFilteringConfig) => void;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
}

export function CrossChannelSpamTab({
    config,
    channelMap,
    roleMap,
    handleChange,
}: CrossChannelSpamTabProps): JSX.Element {
    const filterConfig = config.crossChannelSpam;

    const updateFilter = createFilterUpdater(config, handleChange, "crossChannelSpam");

    const deleting = filterConfig.priorCopies.mode === "DELETE";
    // An empty field means unbounded, so it round-trips as null rather than 0.
    const currentLimit = filterConfig.priorCopies.mode === "DELETE"
        ? filterConfig.priorCopies.limit
        : null;

    const setPriorCopies = (next: PriorCopies): void => {
        updateFilter({ priorCopies: next });
    };

    return (
        <FilterLayoutWrapper
            config={filterConfig}
            updateConfig={updateFilter}
            roleMap={roleMap}
            channelMap={channelMap}
            toggleText="Enable Cross Channel Spam Filter"
        >
            <p>Flags the same text posted across many channels, allowing for small edits.</p>
            <NumberInput
                value={filterConfig.minChannels}
                onChange={(v) => { updateFilter({ minChannels: v ?? 3 }); }}
                label="Channels Required"
                min={2}
                clamp={true}
            />
            <NumberInput
                value={filterConfig.windowSeconds}
                onChange={(v) => { updateFilter({ windowSeconds: v ?? 600 }); }}
                label="Window Duration (seconds)"
                min={10}
                clamp={true}
            />
            <PercentSlider
                value={filterConfig.similarityThreshold}
                onChange={(v) => { updateFilter({ similarityThreshold: v }); }}
                label="Similarity Threshold"
                className="mt-1"
            />
            <NumberInput
                value={filterConfig.minLength}
                onChange={(v) => { updateFilter({ minLength: v ?? 15 }); }}
                label="Minimum Character Length"
                min={1}
                clamp={true}
            />
            <ToggleSwitch
                checked={deleting}
                onChange={(v) => {
                    setPriorCopies(v ? { mode: "DELETE", limit: null } : { mode: "KEEP" });
                }}
                text="Also delete the earlier copies in the other channels"
            />
            {deleting && (
                <NumberInput
                    value={currentLimit}
                    onChange={(v) => {
                        setPriorCopies({ mode: "DELETE", limit: v ?? null });
                    }}
                    label="Channel Limit (leave empty for no limit)"
                    min={1}
                    clamp={true}
                />
            )}
            <p className="text-xs text-muted-foreground">
                Applies to the copies in other channels. The message that triggered the rule is
                handled by the actions above, so removing Delete there leaves this message up.
            </p>
        </FilterLayoutWrapper>
    );
}