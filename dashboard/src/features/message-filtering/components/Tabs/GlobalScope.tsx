import ScopeSettings from "@/features/message-filtering/components/General/ScopeSettings";
import { MessageFilteringConfig } from "@/features/message-filtering/types";

import { createFilterUpdater } from "@/features/message-filtering/filterUpdater";
import { JSX } from "react";

interface GlobalScopeTabProps {
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
}: GlobalScopeTabProps): JSX.Element {
    const filterConfig = config.globalSettings;

    const updateFilter = createFilterUpdater(config, handleChange, "globalSettings");

    return (
        <ScopeSettings
            scope={filterConfig} channelMap={channelMap} roleMap={roleMap} onChange={updateFilter}
        />
    )
}