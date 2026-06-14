import { MessageFilteringConfig } from "@/types/config/messageFiltering";
import { FilterLayoutWrapper } from "@/components/Dashboards/MessageFiltering/FilterLayoutWrapper";
import { createFilterUpdater } from "@/types";
import { PercentSlider } from "@/components/PercentSlider";

interface ExcessiveSpoilersTabProp {
    config: MessageFilteringConfig;
    handleChange: (config: MessageFilteringConfig) => void;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
}

export function ExcessiveSpoilersTab({
    config,
    channelMap,
    roleMap,
    handleChange,
}: ExcessiveSpoilersTabProp) {
    const filterConfig = config.excessive_spoilers;

    const updateFilter = createFilterUpdater(config, handleChange, "excessive_spoilers");

    return (
        <FilterLayoutWrapper
            config={filterConfig}
            updateConfig={updateFilter}
            roleMap={roleMap}
            channelMap={channelMap}
            toggleText="Enable Excessive Spoilers Filter"
        >
            <PercentSlider
                value={filterConfig.threshold}
                onChange={(v) => updateFilter({ threshold: v })}
                label="Maximum Percenatage of Characters in Spoilers"
            />
        </FilterLayoutWrapper>
    )
}