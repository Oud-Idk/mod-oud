import { NumberInput } from "@/components/ui/inputs/NumberInput";
import { MessageFilteringConfig } from "@/features/message-filtering/types";

import { createFilterUpdater } from "@/features/message-filtering/filterUpdater";
import { FilterLayoutWrapper } from "@/features/message-filtering/components/FilterLayout";
import { JSX } from "react";

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
}: ExcessiveMentionsTabProp): JSX.Element {
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
                onChange={(v) => { updateFilter({ maxMentions: v }); }}
                label="Maximum Absolute Mentions per Message"
            />
        </FilterLayoutWrapper>
    )
}