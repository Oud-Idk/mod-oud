import { useState } from "react";
import { Dropdown, DropdownOption } from "@/components/Inputs/Dropdown";
import { MessageFilteringConfig } from "@/types/db/config/messageFiltering";
import { FilterLayoutWrapper } from "@/components/Dashboards/MessageFiltering/FilterLayoutWrapper";
import { createFilterUpdater } from "@/types";
import Link from "next/link";
import { FlagThreshold } from "@/types/db";

interface OffensiveMessagesTabProps {
    config: MessageFilteringConfig;
    handleChange: (data: MessageFilteringConfig) => void;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
}

export function OffensiveMessagesTab({
    config,
    handleChange,
    channelMap,
    roleMap,
}: OffensiveMessagesTabProps) {
    const filterConfig = config.offensiveMessages;
    const [selected, setSelected] = useState<FlagThreshold>(filterConfig.flagThreshold);

    const updateFilter = createFilterUpdater(config, handleChange, "offensiveMessages");

    const handleThresholdChange = (v: string) => {
        const val = v as FlagThreshold;
        setSelected(val);
        updateFilter({ flagThreshold: val });
    };

    const options: DropdownOption<FlagThreshold>[] = [
        { value: "MILD", label: "Mild" },
        { value: "MODERATE", label: "Moderate" },
        { value: "SEVERE", label: "Severe" },
    ];

    return (
        <FilterLayoutWrapper
            config={filterConfig}
            updateConfig={updateFilter}
            roleMap={roleMap}
            channelMap={channelMap}
            toggleText="Enable Offensive Messages Filter"
        >
            <p>Powered by <Link
                href="https://github.com/finnbear/rustrict" className="text-blue-500 hover:underline"
            >Rustirct</Link>. Enabling this feature but doing no actions will default to just logging.</p>
            <div className="space-y-4 max-w-xs">
                <div className="space-y-2">
                    <p className="text-sm font-medium">Threshold</p>
                    <Dropdown
                        options={options} value={selected} onChange={handleThresholdChange}
                    />
                </div>
            </div>
        </FilterLayoutWrapper>
    );
}