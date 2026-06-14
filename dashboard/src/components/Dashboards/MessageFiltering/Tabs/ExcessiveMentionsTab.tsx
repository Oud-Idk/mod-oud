import { MessageFilteringConfig } from "@/types/config/messageFiltering";
import { FilterLayoutWrapper } from "@/components/Dashboards/MessageFiltering/FilterLayoutWrapper";
import { createFilterUpdater } from "@/types";
import { NumberInput } from "@/components/NumberInput";

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
    const filterConfig = config.excessive_mentions;

    const updateFilter = createFilterUpdater(config, handleChange, "excessive_mentions");

    return (
        <FilterLayoutWrapper
            config={filterConfig}
            updateConfig={updateFilter}
            roleMap={roleMap}
            channelMap={channelMap}
            toggleText="Enable Excessive Mentions Filter"
        >
            <NumberInput
                value={filterConfig.max_mentions}
                onChange={(v) => updateFilter({ max_mentions: v })}
                label="Maximum Absolute Mentions per Message"
            />
        </FilterLayoutWrapper>
    )
}