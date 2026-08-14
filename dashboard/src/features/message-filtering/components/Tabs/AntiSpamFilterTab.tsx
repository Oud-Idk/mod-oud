import { NumberInput } from "@/components/ui/NumberInput";
import { MessageFilteringConfig } from "@/features/message-filtering/types";

import { createFilterUpdater } from "@/features/message-filtering/filterUpdater";
import { FilterLayoutWrapper } from "@/features/message-filtering/components/FilterLayout";
import { JSX } from "react";

interface AntiSpamFilterTabProps {
    config: MessageFilteringConfig;
    handleChange: (config: MessageFilteringConfig) => void;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
}

export function AntiSpamFilterTab({
    config,
    channelMap,
    roleMap,
    handleChange,
}: AntiSpamFilterTabProps): JSX.Element {
    const filterConfig = config.antiSpam;

    const updateFilter = createFilterUpdater(config, handleChange, "antiSpam");

    return (
        <FilterLayoutWrapper
            config={filterConfig}
            updateConfig={updateFilter}
            roleMap={roleMap}
            channelMap={channelMap}
            toggleText="Enable Anti Spam Filter"
        >
            <p>Uses a sliding window system to keep track of messages over time.</p>
            <NumberInput
                value={filterConfig.messagesPerWindow}
                onChange={(v) =>{  updateFilter({ messagesPerWindow: v }); }}
                label="Maximum Allowed Messages in Window"
            />
            <NumberInput
                value={filterConfig.windowSeconds}
                onChange={(v) =>{  updateFilter({ windowSeconds: v }); }}
                label="Window Duration (seconds)"
            />
        </FilterLayoutWrapper>
    )
}