import { MessageFilteringConfig } from "@/types/db/config/messageFiltering";
import { FilterLayoutWrapper } from "@/components/Dashboards/MessageFiltering/FilterLayoutWrapper";
import { createFilterUpdater } from "@/types";
import { NumberInput } from "@/components/Inputs/NumberInput";

interface ExcessiveMentionsTabProp {
    config: MessageFilteringConfig;
    handleChange: (config: MessageFilteringConfig) => void;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
}

export function ExcessiveMentionsTab({
    config,
    channelMap,
    roleMap,
    handleChange,
}: ExcessiveMentionsTabProp) {
    const filterConfig = config.excessiveMentions;

    const updateFilter = createFilterUpdater(config, handleChange, "excessiveMentions");

    return (
        <FilterLayoutWrapper
            config={filterConfig}
            updateConfig={updateFilter}
            roleMap={roleMap}
            channelMap={channelMap}
            toggleText="Enable Excessive Mentions Filter"
        >
            <NumberInput
                value={filterConfig.maxMentions}
                onChange={(v) => updateFilter({ maxMentions: v })}
                label="Maximum Absolute Mentions per Message"
            />
        </FilterLayoutWrapper>
    )
}