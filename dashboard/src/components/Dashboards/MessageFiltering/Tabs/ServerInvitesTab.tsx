import { MessageFilteringConfig } from "@/types/db/config/messageFiltering";
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
    const filterConfig = config.serverInvites;

    const updateFilter = createFilterUpdater(config, handleChange, "serverInvites");

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