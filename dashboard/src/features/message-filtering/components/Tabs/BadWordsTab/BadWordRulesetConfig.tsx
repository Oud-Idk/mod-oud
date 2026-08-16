"use client";

import React, { ChangeEvent, JSX, useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { MultiSelectViewer } from "@/components/ui/MultiSelectViewer";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import ScopeSettings from "@/features/message-filtering/components/General/ScopeSettings";
import { TextInput } from "@/components/ui/TextInput";
import ActionsSettings from "@/features/message-filtering/components/General/ActionsSettings";
import { InputLabel } from "@/components/layout/InputLabel";
import { Button } from "@/components/ui/Button";
import { BadWordRuleset, StrategyType } from "@/features/message-filtering/types";

interface BadWordRulesetConfigProps {
    config: BadWordRuleset;
    channelMap: Record<string, string>;
    roleMap?: Record<string, string>;
    isPending: boolean;
    onDelete: (id: string) => Promise<void>;
    onChange: (config: Partial<BadWordRuleset>) => void;
}

export function BadWordRulesetConfig({
    config,
    channelMap,
    roleMap,
    isPending,
    onDelete,
    onChange,
}: BadWordRulesetConfigProps): JSX.Element {
    const [wordInput, setWordInput] = useState("");
    const [strategyInput, setStrategyInput] = useState<StrategyType>("EXACT");

    const patterns = config.patterns;
    const displayList = patterns.map((p) => `${p.value} [${p.strategy}]`);

    const addPattern = (e: ChangeEvent): void => {
        e.preventDefault();
        const trimmed = wordInput.trim();
        if (trimmed === "") return;

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

    const removePattern = (displayString: string): void => {
        const updated = patterns.filter(
            (p) => `${p.value} [${p.strategy}]` !== displayString
        );
        onChange({ patterns: updated });
    };

    return (
        <div className="space-y-4">
            {/* Header / Ruleset Name + Delete */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-border-subtle">
                <div className="flex items-center gap-3 flex-1 max-w-sm w-full">
                    <InputLabel required className="whitespace-nowrap shrink-0">
                        Ruleset Name
                    </InputLabel>
                    <TextInput
                        value={config.name}
                        onChange={(e) =>{  onChange({ name: e.target.value }); }}
                        className="p-1.5 w-full"
                    />
                </div>
                <Button
                    onClick={() => onDelete(config.id)}
                    disabled={isPending}
                    variant="danger"
                >
                    Delete Ruleset
                </Button>
            </div>

            <ToggleSwitch
                checked={config.enabled}
                onChange={(checked) =>{  onChange({ enabled: checked }); }}
                disabled={false}
                text="Enable Ruleset Filter"
                className="mb-2"
                shrink={true}
            />

            {config.enabled && (
                <div className="space-y-2">
                    <div className="space-y-2">
                        <InputLabel>Configure Custom Patterns</InputLabel>

                        {/* Side-by-Side Form Row */}
                        <form onSubmit={addPattern} className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                            <TextInput
                                value={wordInput}
                                onChange={(e) =>{  setWordInput(e.target.value); }}
                                placeholder="Add a word or pattern..."
                                className="flex-1"
                            />
                            <div className="w-full sm:w-44 shrink-0">
                                <Dropdown
                                    options={[
                                        { value: "EXACT", label: "Exact match" },
                                        { value: "SUBSTRING", label: "Substring" },
                                        { value: "REGEX", label: "Regex" },
                                    ]}
                                    value={strategyInput}
                                    onChange={(strategy) =>{  setStrategyInput(strategy ?? "EXACT"); }}
                                    placeholder="Strategy"
                                />
                            </div>
                            <Button type="submit" className="shrink-0">
                                Add
                            </Button>
                        </form>

                        <div>
                            <span className="block">
                                Active Rules ({patterns.length})
                            </span>
                            <MultiSelectViewer
                                selectedList={displayList}
                                onDelete={removePattern}
                                placeholder="No rules configured"
                            />
                        </div>
                    </div>

                    <ActionsSettings
                        actions={config.actions}
                        timeoutDuration={config.timeoutDurationSeconds ?? undefined}
                        onChange={(actions, timeout) =>{ 
                            onChange({ actions, timeoutDurationSeconds: timeout ?? null }); }
                        }
                    />

                    <ScopeSettings
                        scope={config.scope}
                        channelMap={channelMap}
                        roleMap={roleMap}
                        onChange={(newScope) =>{  onChange({ scope: newScope }); }}
                    />
                </div>
            )}
        </div>
    );
}