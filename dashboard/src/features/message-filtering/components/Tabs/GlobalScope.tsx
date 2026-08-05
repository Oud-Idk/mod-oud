import ScopeSettings from "@/features/message-filtering/components/General/ScopeSettings";
import { MessageFilteringConfig } from "@/features/message-filtering/types";

import { createFilterUpdater } from "@/features/message-filtering/filterUpdater";

interface GlobalScopeTab {
    config: MessageFilteringConfig;
    handleChange: (config: MessageFilteringConfig) => void;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
}

export function GlobalScopeTab({
    config,
    channelMap,
    roleMap,
    handleChange,
}: GlobalScopeTab) {
    const filterConfig = config.globalSettings;

    const updateFilter = createFilterUpdater(config, handleChange, "globalSettings");

    return (
        <ScopeSettings
            scope={filterConfig} channelMap={channelMap} roleMap={roleMap} onChange={updateFilter}
        />
    )
}