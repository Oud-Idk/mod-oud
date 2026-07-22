import { MessageFilteringConfig } from "@/types/db/config/messageFiltering";
import { FilterLayoutWrapper } from "@/components/Dashboards/MessageFiltering/FilterLayoutWrapper";
import { createFilterUpdater } from "@/types";
import { PercentSlider } from "@/components/Inputs/PercentSlider";
import { NumberInput } from "@/components/Inputs/NumberInput";

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
            />
            <NumberInput
                value={filterConfig.minLength}
                onChange={(v) => updateFilter({ minLength: v })}
                label="Minimum Character Length"
            />
        </FilterLayoutWrapper>
    )
}