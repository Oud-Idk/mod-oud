import { PercentSlider } from "@/components/ui/PercentSlider";
import { MessageFilteringConfig } from "@/features/message-filtering/types";

import { createFilterUpdater } from "@/features/message-filtering/filterUpdater";
import { FilterLayoutWrapper } from "@/features/message-filtering/components/FilterLayout";
import { JSX } from "react";

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
}: ExcessiveSpoilersTabProp): JSX.Element {
    const filterConfig = config.excessiveSpoilers;

    const updateFilter = createFilterUpdater(config, handleChange, "excessiveSpoilers");

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
                onChange={(v) => { updateFilter({ threshold: v }); }}
                label="Maximum Percenatage of Characters in Spoilers"
            />
        </FilterLayoutWrapper>
    )
}