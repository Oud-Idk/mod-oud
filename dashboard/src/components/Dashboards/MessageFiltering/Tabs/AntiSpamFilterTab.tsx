import { MessageFilteringConfig } from "@/types/config/messageFiltering";
import { FilterLayoutWrapper } from "@/components/Dashboards/MessageFiltering/FilterLayoutWrapper";
import { createFilterUpdater } from "@/types";
import { NumberInput } from "@/components/NumberInput";

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
    const filterConfig = config.anti_spam;

    const updateFilter = createFilterUpdater(config, handleChange, "anti_spam");

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
                value={filterConfig.messages_per_window}
                onChange={(v) => updateFilter({ messages_per_window: v })}
                label="Maximum Allowed Messages in Window"
            />
            <NumberInput
                value={filterConfig.window_seconds}
                onChange={(v) => updateFilter({ window_seconds: v })}
                label="Window Duration (seconds)"
            />
        </FilterLayoutWrapper>
    )
}