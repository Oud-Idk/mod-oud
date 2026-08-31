"use client";

import React, { JSX, useState, useEffect, useMemo } from "react";
import { Dropdown } from "@/components/ui/inputs/Dropdown";
import { MultiSelectViewer } from "@/components/ui/MultiSelectViewer";
import { ToggleSwitch } from "@/components/ui/inputs/ToggleSwitch";
import ScopeSettings from "@/features/message-filtering/components/General/ScopeSettings";
import { TextInput } from "@/components/ui/inputs/TextInput";
import ActionsSettings from "@/features/message-filtering/components/General/ActionsSettings";
import { InputLabel } from "@/components/layout/InputLabel";
import { Button } from "@/components/ui/inputs/Button";
import { BadWordRuleset, StrategyType } from "@/features/message-filtering/types";
import { LongTextInput } from "@/components/ui/inputs/LongTextInput";

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

    const regexPatterns = useMemo(
        () => patterns.filter((p) => p.strategy === "REGEX"),
        [patterns]
    );
    const standardPatterns = useMemo(
        () => patterns.filter((p) => p.strategy !== "REGEX"),
        [patterns]
    );

    const standardJoined = useMemo(
        () => standardPatterns.map((p) => p.value).join(", "),
        [standardPatterns]
    );

    const [bulkText, setBulkText] = useState(standardJoined);

    // Keep bulkText in sync with external changes
    useEffect(() => {
        setBulkText(standardJoined);
    }, [standardJoined]);

    const handleQuickAdd = (e: React.SyntheticEvent<HTMLFormElement>): void => {
        e.preventDefault();
        const trimmed = wordInput.trim();
        if (trimmed.length === 0) {
            return;
        }

        if (strategyInput === "REGEX") {
            const exists = regexPatterns.some((p) => p.value === trimmed);
            if (!exists) {
                onChange({
                    patterns: [...patterns, { value: trimmed, strategy: "REGEX" }],
                });
            }
        } else {
            const wordsToAdd = trimmed
                .split(/[,\n]+/)
                .map((w) => w.trim())
                .filter((w) => w.length > 0);

            const newPatterns = [...patterns];
            for (const word of wordsToAdd) {
                const exists = newPatterns.some(
                    (p) => p.value.toLowerCase() === word.toLowerCase() && p.strategy === strategyInput
                );
                if (!exists) {
                    newPatterns.push({ value: word, strategy: strategyInput });
                }
            }
            onChange({ patterns: newPatterns });
        }

        setWordInput("");
    };

    const handleBulkTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
        const text = e.target.value;
        setBulkText(text);

        const parsedWords = text
            .split(/[,\n]+/)
            .map((w) => w.trim())
            .filter((w) => w.length > 0);

        const seen = new Set<string>();
        const updatedStandardPatterns: { value: string; strategy: StrategyType }[] = [];

        for (const word of parsedWords) {
            const lower = word.toLowerCase();
            if (!seen.has(lower)) {
                seen.add(lower);
                const existing = standardPatterns.find((p) => p.value.toLowerCase() === lower);
                updatedStandardPatterns.push({
                    value: word,
                    strategy: existing !== undefined ? existing.strategy : "EXACT",
                });
            }
        }

        onChange({
            patterns: [...updatedStandardPatterns, ...regexPatterns],
        });
    };

    const removePattern = (displayString: string): void => {
        const updated = patterns.filter(
            (p) => `${p.value} [${p.strategy}]` !== displayString
        );
        onChange({ patterns: updated });
    };

    const displayList = patterns.map((p) => `${p.value} [${p.strategy}]`);

    return (
        <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-border-subtle">
                <div className="flex items-center gap-3 flex-1 max-w-sm w-full">
                    <InputLabel required className="whitespace-nowrap shrink-0">
                        Ruleset Name
                    </InputLabel>
                    <TextInput
                        value={config.name}
                        onChange={(e) => {
                            onChange({ name: e.target.value });
                        }}
                        className="p-1.5 w-full"
                    />
                </div>
                <Button
                    onClick={() => {
                        void onDelete(config.id);
                    }}
                    disabled={isPending}
                    variant="danger"
                >
                    Delete Ruleset
                </Button>
            </div>

            <ToggleSwitch
                checked={config.enabled}
                onChange={(checked) => {
                    onChange({ enabled: checked });
                }}
                disabled={false}
                text="Enable Ruleset Filter"
                className="mb-2"
                shrink={true}
            />

            {config.enabled && (
                <div className="space-y-4">
                    <div className="space-y-2">
                        <InputLabel>Add Word or Regex</InputLabel>
                        <form
                            onSubmit={handleQuickAdd}
                            className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center max-w-md"
                        >
                            <TextInput
                                value={wordInput}
                                onChange={(e) => {
                                    setWordInput(e.target.value);
                                }}
                                placeholder={
                                    strategyInput === "REGEX"
                                        ? "Enter regex pattern..."
                                        : "Add word (or comma-separated)..."
                                }
                                className="flex-1"
                            />
                            <div className="w-full sm:w-44 shrink-0">
                                <Dropdown
                                    options={[
                                        { value: "EXACT", label: "Exact word or phrase" },
                                        { value: "SUBSTRING", label: "Substring" },
                                        { value: "REGEX", label: "Regex" },
                                    ]}
                                    value={strategyInput}
                                    onChange={(strategy) => {
                                        setStrategyInput(strategy ?? "EXACT");
                                    }}
                                    placeholder="Strategy"
                                />
                            </div>
                            <Button type="submit" className="shrink-0">
                                Add
                            </Button>
                        </form>
                    </div>

                    <div className="space-y-1 max-w-md">
                        <div className="flex justify-between items-center">
                            <InputLabel>Bulk Words (Comma or Newline separated)</InputLabel>
                            <span className="text-xs text-text-subtle">
                                {standardPatterns.length} standard words
                            </span>
                        </div>
                        <LongTextInput
                            value={bulkText}
                            onChange={handleBulkTextChange}
                            placeholder="apple, banana, orange, badword..."
                            rows={4}
                        />
                        <p className="text-xs text-text-subtle">
                            Regex rules are excluded here to prevent accidental corruption.
                        </p>
                    </div>

                    <div>
                        <span className="block text-sm font-medium mb-1">
                            All Active Rules ({patterns.length})
                        </span>
                        <MultiSelectViewer
                            selectedList={displayList}
                            onDelete={removePattern}
                            placeholder="No rules configured"
                        />
                    </div>

                    <ActionsSettings
                        actions={config.actions}
                        timeoutDuration={config.timeoutDurationSeconds ?? undefined}
                        onChange={(actions, timeout) => {
                            onChange({ actions, timeoutDurationSeconds: timeout ?? null });
                        }}
                    />

                    <ScopeSettings
                        scope={config.scope}
                        channelMap={channelMap}
                        roleMap={roleMap}
                        onChange={(newScope) => {
                            onChange({ scope: newScope });
                        }}
                    />
                </div>
            )}
        </div>
    );
}