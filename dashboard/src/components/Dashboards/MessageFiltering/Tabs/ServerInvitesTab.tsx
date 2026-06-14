import { MessageFilteringConfig } from "@/types/config/messageFiltering";
import { FilterLayoutWrapper } from "@/components/Dashboards/MessageFiltering/FilterLayoutWrapper";
import { createFilterUpdater } from "@/types";

interface ServerInvitesTabProps {
    config: MessageFilteringConfig;
    handleChange: (data: MessageFilteringConfig) => void;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
}

export function ServerInvitesTab({
    config,
    handleChange,
    channelMap,
    roleMap,
}: ServerInvitesTabProps) {
    const filterConfig = config.server_invites;

    const updateFilter = createFilterUpdater(config, handleChange, "server_invites");

    return (
        <FilterLayoutWrapper
            config={filterConfig}
            updateConfig={updateFilter}
            toggleText="Enable Server Invites Filter"
            channelMap={channelMap}
            roleMap={roleMap}
        />
    );
}