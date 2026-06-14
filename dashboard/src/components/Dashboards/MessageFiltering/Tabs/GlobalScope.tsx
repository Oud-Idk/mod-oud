import { MessageFilteringConfig } from "@/types/config/messageFiltering";
import { createFilterUpdater } from "@/types";
import ScopeSettings from "@/components/Dashboards/MessageFiltering/General/ScopeSettings";

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
    const filterConfig = config.global_settings;

    const updateFilter = createFilterUpdater(config, handleChange, "global_settings");

    return (
        <ScopeSettings
            scope={filterConfig} channelMap={channelMap} roleMap={roleMap} onChange={updateFilter}
        />
    )
}