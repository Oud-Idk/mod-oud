import { useState } from "react";
import { Dropdown, DropdownOption } from "@/components/ui/Dropdown";
import Link from "next/link";
import { MessageFilteringConfig, FlagThreshold } from "@/features/message-filtering/types";

import { createFilterUpdater } from "@/features/message-filtering/filterUpdater";
import { InputLabel } from "@/components/layout/InputLabel";
import { FilterLayoutWrapper } from "@/features/message-filtering/components/FilterLayout";

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

    const handleThresholdChange = (v: FlagThreshold | null) => {
        if (!v) return;
        setSelected(v);
        updateFilter({ flagThreshold: v });
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
            >Rustirct</Link>. Enabling this feature but doing no actions will default to logging only.</p>
            <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                    <InputLabel>Threshold</InputLabel>
                    <Dropdown
                        options={options} value={selected} onChange={handleThresholdChange}
                    />
                </div>
            </div>
        </FilterLayoutWrapper>
    );
}