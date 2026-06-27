"use client";

import React, { FormEvent, useState } from "react";
import { Dropdown } from "@/components/Inputs/Dropdown";
import { MultiSelectViewer } from "@/components/MultiSelectViewer";
import { BadWordRulesetRow } from "@/utils/db/config";
import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import ScopeSettings from "@/components/Dashboards/MessageFiltering/General/ScopeSettings";
import { TextInput } from "@/components/Inputs/TextInput";
import ActionsSettings from "@/components/Dashboards/MessageFiltering/General/ActionsSettings";

type StrategyType = "exact" | "substring" | "regex";

interface BadWordRulesetConfigProps {
    config: BadWordRulesetRow;
    channelMap: Record<string, string>;
    roleMap?: Record<string, string>;
    isPending: boolean;
    onDelete: (id: string) => Promise<void>;
    onChange: (config: Partial<BadWordRulesetRow>) => void;
    setIsEmpty: (isEmpty: boolean) => void;
}

export function BadWordRulesetConfig({
    config,
    channelMap,
    roleMap,
    isPending,
    onDelete,
    onChange,
}: BadWordRulesetConfigProps) {
    const [wordInput, setWordInput] = useState("");
    const [strategyInput, setStrategyInput] = useState<StrategyType>("exact");

    const patterns = config.patterns || [];
    const displayList = patterns.map((p) => `${p.value} [${p.strategy}]`);

    const addPattern = (e?: FormEvent) => {
        if (e) e.preventDefault();
        const trimmed = wordInput.trim();
        if (!trimmed) return;

        const exists = patterns.some(
            (p) => p.value.toLowerCase() === trimmed.toLowerCase() && p.strategy === strategyInput
        );

        if (!exists) {
            onChange({
                patterns: [...patterns, { value: trimmed, strategy: strategyInput }],
            });
        }
        setWordInput("");
    };

    const removePattern = (displayString: string) => {
        const updated = patterns.filter(
            (p) => `${p.value} [${p.strategy}]` !== displayString
        );
        onChange({ patterns: updated });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-zinc-800">
                <div className="space-y-1">
                    <label className="block text-xs uppercase text-zinc-500 font-semibold tracking-wider">Ruleset
                        Name</label>
                    <input
                        type="text"
                        value={config.name}
                        onChange={(e) => onChange({ name: e.target.value })}
                        className="bg-transparent text-lg font-bold border-none focus:outline-none p-0 focus:ring-0 max-w-sm"
                    />
                </div>
                <button
                    onClick={() => onDelete(config.id)}
                    disabled={isPending}
                    className="text-xs text-red-500 border border-red-500/30 hover:bg-red-500/10 px-3 py-1.5 rounded transition disabled:opacity-50 cursor-pointer"
                >
                    Delete Ruleset
                </button>
            </div>

            <ToggleSwitch
                enabled={config.enabled}
                onChange={(checked) => onChange({ enabled: checked })}
                disabled={false}
                text="Enable Ruleset Filter"
                shrink={true}
            />

            {config.enabled && (
                <div className="space-y-4">
                    <div>
                        <label className="block font-medium">Configure Custom Patterns</label>
                        <TextInput
                            value={wordInput}
                            onChange={(e) => setWordInput(e.target.value)}
                            placeholder="Add a word or pattern..."
                            onSubmit={addPattern}
                            className="mb-2"
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
                            className="max-w-xs"
                        />

                        <div className="space-y-2 mt-4">
                            <span className="block">Active Rules</span>
                            <MultiSelectViewer
                                selectedList={displayList} onDelete={removePattern} placeholder="No rules configured"
                            />
                        </div>
                    </div>

                    <ActionsSettings
                        actions={config.actions}
                        timeoutDuration={config.timeoutDurationSeconds ?? undefined}
                        onChange={(actions, timeout) =>
                            onChange({ actions, timeoutDurationSeconds: timeout ?? null })
                        }
                    />

                    <ScopeSettings
                        scope={config.scope}
                        channelMap={channelMap}
                        roleMap={roleMap}
                        onChange={(newScope) => onChange({ scope: newScope })}
                    />
                </div>
            )}
        </div>
    );
}