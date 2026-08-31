import { NumberInput } from "@/components/ui/inputs/NumberInput";
import { MessageFilteringConfig } from "@/features/message-filtering/types";

import { createFilterUpdater } from "@/features/message-filtering/filterUpdater";
import { FilterLayoutWrapper } from "@/features/message-filtering/components/FilterLayout";
import { JSX } from "react";

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
}: ExcessiveEmojisTabProp): JSX.Element {
    const filterConfig = config.excessiveEmojis;

    const updateFilter = createFilterUpdater(config, handleChange, "excessiveEmojis");

    return (
        <FilterLayoutWrapper
            config={filterConfig}
            updateConfig={updateFilter}
            roleMap={roleMap}
            channelMap={channelMap}
            toggleText="Enable Excessive Emojis Filter"
        >
            <NumberInput
                value={filterConfig.maxEmojis}
                onChange={(v) => { updateFilter({ maxEmojis: v }); }}
                label="Maximum Absolute Emojis per Message"
            />
        </FilterLayoutWrapper>
    )
}