import { FormEvent, useState } from "react";
import { Dropdown } from "@/components/Dropdown";
import { MultiSelectViewer } from "@/components/MultiSelectViewer";
import { MessageFilteringConfig, Pattern } from "@/types/config/messageFiltering";
import { FilterLayoutWrapper } from "@/components/Dashboards/MessageFiltering/FilterLayoutWrapper";
import { createFilterUpdater } from "@/types";

interface BadWordTabProps {
    config: MessageFilteringConfig;
    handleChange: (config: MessageFilteringConfig) => void;
    channelMap?: Record<string, string>;
    roleMap?: Record<string, string>;
}

type StrategyType = "exact" | "substring" | "regex";

export function BadWordTab({
    config,
    handleChange,
    channelMap,
    roleMap,
}: BadWordTabProps) {
    const [wordInput, setWordInput] = useState("");
    const [strategyInput, setStrategyInput] = useState<StrategyType>("exact");

    const filterConfig = config.bad_words;
    const updateFilter = createFilterUpdater(config, handleChange, "bad_words");

    const patterns: Pattern[] = filterConfig.patterns || [];

    // Map patterns to a string array for MultiSelectViewer compatibility
    const displayList = patterns.map(
        (p) => `${p.value} [${p.strategy}]`
    );

    const addPattern = (e?: FormEvent) => {
        if (e) e.preventDefault();
        const trimmed = wordInput.trim();
        if (!trimmed) return;

        // Check if the exact value and strategy combination already exists
        const exists = patterns.some(
            (p) => p.value.toLowerCase() === trimmed.toLowerCase() && p.strategy === strategyInput
        );

        if (!exists) {
            updateFilter({
                patterns: [...patterns, { value: trimmed, strategy: strategyInput }],
            });
        }
        setWordInput("");
    };

    const removePattern = (displayString: string) => {
        // Find and filter out the pattern matching the formatted string
        const updated = patterns.filter(
            (p) => `${p.value} [${p.strategy}]` !== displayString
        );
        updateFilter({ patterns: updated });
    };

    return (
        <FilterLayoutWrapper
            config={filterConfig}
            updateConfig={updateFilter}
            roleMap={roleMap}
            channelMap={channelMap}
            toggleText="Enable Bad Words Filter"
        >
            <div className="space-y-6">
                {/* Configuration Input Area */}
                <div className="space-y-4">
                    <label className="block text-sm font-medium">Configure Patterns</label>

                    <form onSubmit={addPattern} className="flex flex-wrap gap-2 max-w-xl items-center">
                        <input
                            type="text"
                            placeholder="Add a word or pattern..."
                            value={wordInput}
                            onChange={(e) => setWordInput(e.target.value)}
                            className="border rounded px-3 py-1.5 text-sm focus:outline-none flex-1 min-w-50 placeholder-neutral-500 bg-neutral-300/10 border-neutral-500"
                        />

                        <Dropdown
                            options={[
                                { value: "exact", label: "Exact match" },
                                { value: "substring", label: "Substring" },
                                { value: "regex", label: "Regex" },
                            ]}
                            value={strategyInput}
                            onChange={(strategy) => setStrategyInput(strategy as StrategyType)}
                            placeholder="Strategy"
                            className="w-36"
                        />

                        <button
                            type="submit"
                            className="px-4 py-1.5 text-sm bg-gray-850 rounded cursor-pointer border hover:bg-neutral-300/10"
                        >
                            Add
                        </button>
                    </form>
                </div>

                {/* Bad Words Viewer */}
                <div className="space-y-2">
                    <label className="block text-sm font-medium">Active Rules</label>
                    <MultiSelectViewer
                        selectedList={displayList} onDelete={removePattern} placeholder="No rules configured"
                    />
                </div>
            </div>
        </FilterLayoutWrapper>
    );
}