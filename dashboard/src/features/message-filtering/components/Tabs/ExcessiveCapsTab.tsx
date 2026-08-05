import { FilterLayoutWrapper } from "@/features/message-filtering/components/FilterLayoutWrapper";
import { PercentSlider } from "@/components/ui/PercentSlider";
import { NumberInput } from "@/components/ui/NumberInput";
import { MessageFilteringConfig } from "@/features/message-filtering/types";

import { createFilterUpdater } from "@/features/message-filtering/filterUpdater";

interface ExcessiveCapsProps {
    config: MessageFilteringConfig;
    handleChange: (config: MessageFilteringConfig) => void;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
}

export function ExcessiveCapsTab({
    config,
    channelMap,
    roleMap,
    handleChange,
}: ExcessiveCapsProps) {
    const filterConfig = config.excessiveCaps;

    const updateFilter = createFilterUpdater(config, handleChange, "excessiveCaps");

    return (
        <FilterLayoutWrapper
            config={filterConfig}
            updateConfig={updateFilter}
            roleMap={roleMap}
            channelMap={channelMap}
            toggleText="Enable Excessive Caps Filter"
        >
            <PercentSlider
                value={filterConfig.threshold}
                onChange={(v) => updateFilter({ threshold: v })}
                label="Threshold Percentage"
                className="mt-1"
            />
            <NumberInput
                value={filterConfig.minLength}
                onChange={(v) => updateFilter({ minLength: v })}
                label="Minimum Character Length"
            />
        </FilterLayoutWrapper>
    )
}