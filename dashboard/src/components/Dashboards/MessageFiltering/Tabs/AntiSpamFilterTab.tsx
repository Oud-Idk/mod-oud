import { MessageFilteringConfig } from "@/types/db/config/messageFiltering";
import { FilterLayoutWrapper } from "@/components/Dashboards/MessageFiltering/FilterLayoutWrapper";
import { createFilterUpdater } from "@/types";
import { NumberInput } from "@/components/Inputs/NumberInput";

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
}: AntiSpamFilterTabProps) {
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
                onChange={(v) => updateFilter({ messagesPerWindow: v })}
                label="Maximum Allowed Messages in Window"
            />
            <NumberInput
                value={filterConfig.windowSeconds}
                onChange={(v) => updateFilter({ windowSeconds: v })}
                label="Window Duration (seconds)"
            />
        </FilterLayoutWrapper>
    )
}