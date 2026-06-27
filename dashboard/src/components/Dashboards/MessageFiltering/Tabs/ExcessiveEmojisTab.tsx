import { MessageFilteringConfig } from "@/types/config/messageFiltering";
import { FilterLayoutWrapper } from "@/components/Dashboards/MessageFiltering/FilterLayoutWrapper";
import { createFilterUpdater } from "@/types";
import { NumberInput } from "@/components/Inputs/NumberInput";

interface ExcessiveEmojisTabProp {
    config: MessageFilteringConfig;
    handleChange: (config: MessageFilteringConfig) => void;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
}

export function ExcessiveEmojisTab({
    config,
    channelMap,
    roleMap,
    handleChange,
}: ExcessiveEmojisTabProp) {
    const filterConfig = config.excessive_emojis;

    const updateFilter = createFilterUpdater(config, handleChange, "excessive_emojis");

    return (
        <FilterLayoutWrapper
            config={filterConfig}
            updateConfig={updateFilter}
            roleMap={roleMap}
            channelMap={channelMap}
            toggleText="Enable Excessive Emojis Filter"
        >
            <NumberInput
                value={filterConfig.max_emojis}
                onChange={(v) => updateFilter({ max_emojis: v })}
                label="Maximum Absolute Emojis per Message"
            />
        </FilterLayoutWrapper>
    )
}