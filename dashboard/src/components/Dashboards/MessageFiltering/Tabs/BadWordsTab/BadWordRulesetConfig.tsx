"use client";

import React, { FormEvent, useState } from "react";
import { Dropdown } from "@/components/Inputs/Dropdown";
import { MultiSelectViewer } from "@/components/MultiSelectViewer";
import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import ScopeSettings from "@/components/Dashboards/MessageFiltering/General/ScopeSettings";
import { TextInput } from "@/components/Inputs/TextInput";
import ActionsSettings from "@/components/Dashboards/MessageFiltering/General/ActionsSettings";
import { InputLabel } from "@/components/Layout/InputLabel";
import PrimaryButton from "@/components/Inputs/Buttons/PrimaryButton";
import { BadWordRuleset, StrategyType } from "@/types/db";


interface BadWordRulesetConfigProps {
    config: BadWordRuleset;
    channelMap: Record<string, string>;
    roleMap?: Record<string, string>;
    isPending: boolean;
    onDelete: (id: string) => Promise<void>;
    onChange: (config: Partial<BadWordRuleset>) => void;
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
    const [strategyInput, setStrategyInput] = useState<StrategyType>("EXACT");

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
                <div className="flex flex-row items-center gap-2">
                    <InputLabel>
                        Ruleset Name
                    </InputLabel>
                    <TextInput
                        value={config.name}
                        onChange={(e) => onChange({ name: e.target.value })}
                        disableSubmitButton
                        className="p-1"
                    />
                </div>
                <PrimaryButton
                    onClick={() => onDelete(config.id)} disabled={isPending}
                >
                    Delete Ruleset
                </PrimaryButton>
            </div>

            <ToggleSwitch
                checked={config.enabled}
                onChange={(checked) => onChange({ enabled: checked })}
                disabled={false}
                text="Enable Ruleset Filter"
                className="mb-2"
                shrink={true}
            />

            {config.enabled && (
                <div className="space-y-4">
                    <div>
                        <InputLabel>Configure Custom Patterns</InputLabel>
                        <TextInput
                            value={wordInput}
                            onChange={(e) => setWordInput(e.target.value)}
                            placeholder="Add a word or pattern..."
                            onSubmit={addPattern}
                            className="mb-2"
                        />
                        <Dropdown
                            options={[
                                { value: "EXACT", label: "Exact match" },
                                { value: "SUBSTRING", label: "Substring" },
                                { value: "REGEX", label: "Regex" },
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
                        timeoutDuration={config.timeout_duration_seconds ?? undefined}
                        onChange={(actions, timeout) =>
                            onChange({ actions, timeout_duration_seconds: timeout ?? null })
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