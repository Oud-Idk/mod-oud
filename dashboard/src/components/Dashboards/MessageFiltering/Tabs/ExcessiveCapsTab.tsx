import { MessageFilteringConfig } from "@/types/config/messageFiltering";
import { FilterLayoutWrapper } from "@/components/Dashboards/MessageFiltering/FilterLayoutWrapper";
import { createFilterUpdater } from "@/types";
import { PercentSlider } from "@/components/PercentSlider";
import { NumberInput } from "@/components/NumberInput";

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
    const filterConfig = config.excessive_caps;

    const updateFilter = createFilterUpdater(config, handleChange, "excessive_caps");

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
                value={filterConfig.min_length}
                onChange={(v) => updateFilter({ min_length: v })}
                label="Minimum Character Length"
            />
        </FilterLayoutWrapper>
    )
}