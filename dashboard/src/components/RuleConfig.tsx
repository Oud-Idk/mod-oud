"use client";

import { useMemo, useOptimistic, useState, useTransition } from "react";
import { NumberInput } from "@/components/Inputs/NumberInput";
import { Dropdown } from "@/components/Inputs/Dropdown";

export interface RuleItem {
    id: number;
    trigger: number;
    actions: string[];
    flag?: boolean;
    rolesToAdd?: string[] | null;
    rolesToRemove?: string[] | null;
}

type OptimisticAction =
    | { type: "add"; rules: RuleItem[] }
    | { type: "delete"; ids: number[] };

export interface RuleConfigProps {
    guildId: string;
    rules: RuleItem[];
    onSave: (rulesToSave: RuleItem[]) => Promise<void>;
    onDelete: (ids: number[]) => Promise<void>;
    allActionOptions: Array<{ value: string; label: string }>;
    roleMap?: Record<string, string>;

    title: string;
    createTitle: string;
    triggerLabel: string;
    actionsLabel: string;
    flagLabel?: string;
    activeRulesTitle: string;
    emptyText: string;

    actionPrefix?: string;
    flagBadgeLabel?: string;

    minTrigger?: number;
    maxTrigger?: number;
    defaultTrigger?: number;

    multiple?: boolean;
}

// Helper to safely parse action arrays in case they arrive from database serialization as strings or null
function safeGetArray(value: any): string[] {
    if (Array.isArray(value)) {
        return value;
    }
    if (typeof value === "string") {
        if (value.startsWith("[") && value.endsWith("]")) {
            try {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) {
                    return parsed.map(String);
                }
            } catch {
                // fall through to comma-separated handling
            }
        }
        return value.split(",").map((s) => s.trim()).filter(Boolean);
    }
    return [];
}

export function RuleConfig({
    guildId,
    rules = [],
    onSave,
    onDelete,
    allActionOptions,
    roleMap = {},
    title,
    createTitle,
    triggerLabel,
    actionsLabel,
    flagLabel,
    activeRulesTitle,
    emptyText,
    actionPrefix = "",
    flagBadgeLabel,
    minTrigger = 1,
    maxTrigger = 100,
    defaultTrigger = 5,
    multiple = true,
}: RuleConfigProps) {
    const [triggerValue, setTriggerValue] = useState<number>(defaultTrigger);
    const [selectedActionIds, setSelectedActionIds] = useState<string[]>([]);
    const [selectedRolesToAdd, setSelectedRolesToAdd] = useState<string[]>([]);
    const [selectedRolesToRemove, setSelectedRolesToRemove] = useState<string[]>([]);
    const [flagValue, setFlagValue] = useState<boolean>(false);
    const [isMutating, startMutation] = useTransition();

    const [selectedActiveIds, setSelectedActiveIds] = useState<number[]>([]);

    const actionLabelMap = useMemo(() => {
        return new Map(allActionOptions.map((opt) => [opt.value, opt.label]));
    }, [allActionOptions]);

    const roleOptions = useMemo(() => {
        return Object.entries(roleMap).map(([id, name]) => ({
            value: id,
            label: name,
        }));
    }, [roleMap]);

    const showRolesToAdd = selectedActionIds.includes("role_add");
    const showRolesToRemove = selectedActionIds.includes("role_remove");

    // Optimistic state management with array normalization
    const [optimisticRules, setOptimisticRules] = useOptimistic<
        RuleItem[],
        OptimisticAction
    >(rules, (state, action) => {
        switch (action.type) {
            case "add": {
                const newState = [...state];
                for (const newRule of action.rules) {
                    const existingIndex = newState.findIndex(
                        (r) => r.trigger === newRule.trigger
                    );
                    if (existingIndex > -1) {
                        const existingActions = safeGetArray(newState[existingIndex].actions);
                        const newActions = safeGetArray(newRule.actions);

                        const mergedActions = multiple
                            ? Array.from(new Set([...existingActions, ...newActions]))
                            : newActions;

                        const existingToAdd = safeGetArray(newState[existingIndex].rolesToAdd);
                        const newToAdd = safeGetArray(newRule.rolesToAdd);
                        const mergedToAdd = Array.from(new Set([...existingToAdd, ...newToAdd]));

                        const existingToRemove = safeGetArray(newState[existingIndex].rolesToRemove);
                        const newToRemove = safeGetArray(newRule.rolesToRemove);
                        const mergedToRemove = Array.from(new Set([...existingToRemove, ...newToRemove]));

                        newState[existingIndex] = {
                            ...newState[existingIndex],
                            actions: mergedActions,
                            flag: newRule.flag,
                            rolesToAdd: mergedToAdd.length > 0 ? mergedToAdd : null,
                            rolesToRemove: mergedToRemove.length > 0 ? mergedToRemove : null,
                        };
                    } else {
                        newState.push({
                            ...newRule,
                            actions: safeGetArray(newRule.actions),
                            rolesToAdd: newRule.rolesToAdd ? safeGetArray(newRule.rolesToAdd) : null,
                            rolesToRemove: newRule.rolesToRemove ? safeGetArray(newRule.rolesToRemove) : null,
                        });
                    }
                }
                return newState;
            }
            case "delete": {
                const deleteSet = new Set(action.ids);
                return state.filter((r) => !deleteSet.has(r.id));
            }
            default:
                return state;
        }
    });

    const handleAddRule = () => {
        if (selectedActionIds.length === 0) return;

        const optimisticPayload: RuleItem[] = [
            {
                id: -Date.now(),
                trigger: triggerValue,
                actions: selectedActionIds,
                flag: flagValue,
                rolesToAdd: showRolesToAdd ? selectedRolesToAdd : null,
                rolesToRemove: showRolesToRemove ? selectedRolesToRemove : null,
            },
        ];

        const newState = [...optimisticRules];
        for (const newRule of optimisticPayload) {
            const existingIndex = newState.findIndex((r) => r.trigger === newRule.trigger);
            if (existingIndex > -1) {
                const existingActions = safeGetArray(newState[existingIndex].actions);
                const newActions = safeGetArray(newRule.actions);

                const mergedActions = multiple
                    ? Array.from(new Set([...existingActions, ...newActions]))
                    : newActions;

                const existingToAdd = safeGetArray(newState[existingIndex].rolesToAdd);
                const newToAdd = safeGetArray(newRule.rolesToAdd);
                const mergedToAdd = Array.from(new Set([...existingToAdd, ...newToAdd]));

                const existingToRemove = safeGetArray(newState[existingIndex].rolesToRemove);
                const newToRemove = safeGetArray(newRule.rolesToRemove);
                const mergedToRemove = Array.from(new Set([...existingToRemove, ...newToRemove]));

                newState[existingIndex] = {
                    ...newState[existingIndex],
                    actions: mergedActions,
                    flag: newRule.flag,
                    rolesToAdd: mergedToAdd.length > 0 ? mergedToAdd : null,
                    rolesToRemove: mergedToRemove.length > 0 ? mergedToRemove : null,
                };
            } else {
                newState.push(newRule);
            }
        }

        startMutation(async () => {
            setOptimisticRules({ type: "add", rules: optimisticPayload });
            setSelectedActionIds([]);
            setSelectedRolesToAdd([]);
            setSelectedRolesToRemove([]);

            try {
                await onSave(newState);
            } catch (err) {
                alert("Failed to save changes.");
            }
        });
    };

    const handleDeleteSingle = (id: number) => {
        if (!confirm("Are you sure you want to remove this rule?")) return;

        startMutation(async () => {
            setOptimisticRules({ type: "delete", ids: [id] });
            setSelectedActiveIds((prev) => prev.filter((activeId) => activeId !== id));

            try {
                await onDelete([id]);
            } catch (err) {
                alert("Failed to delete rule.");
            }
        });
    };

    const handleDeleteSelected = () => {
        if (selectedActiveIds.length === 0) return;
        if (!confirm(`Are you sure you want to remove the ${selectedActiveIds.length} selected rule(s)?`)) return;

        const idsToDelete = [...selectedActiveIds];

        startMutation(async () => {
            setOptimisticRules({ type: "delete", ids: idsToDelete });
            setSelectedActiveIds([]);

            try {
                await onDelete(idsToDelete);
            } catch (err) {
                alert("Failed to delete selected rules.");
            }
        });
    };

    const sortedRules = [...optimisticRules].sort((a, b) => a.trigger - b.trigger);

    const allActiveIds = sortedRules.map((r) => r.id);
    const isAllSelected = sortedRules.length > 0 && selectedActiveIds.length === sortedRules.length;
    const isSomeSelected = selectedActiveIds.length > 0 && selectedActiveIds.length < sortedRules.length;

    const handleToggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedActiveIds([]);
        } else {
            setSelectedActiveIds(allActiveIds);
        }
    };

    const handleToggleSelect = (id: number) => {
        setSelectedActiveIds((prev) =>
            prev.includes(id) ? prev.filter((activeId) => activeId !== id) : [...prev, id]
        );
    };

    const filteredOptions = useMemo(() => {
        const existingRule = optimisticRules.find((r) => r.trigger === triggerValue);
        const existingActions = existingRule ? safeGetArray(existingRule.actions) : [];

        if (!multiple && existingRule && existingActions.length > 0) {
            return [];
        }

        return allActionOptions.filter((opt) => !existingActions.includes(opt.value));
    }, [optimisticRules, triggerValue, multiple, allActionOptions]);

    const isAddDisabled =
        selectedActionIds.length === 0 ||
        isMutating ||
        (showRolesToAdd && selectedRolesToAdd.length === 0) ||
        (showRolesToRemove && selectedRolesToRemove.length === 0);

    return (
        <div className="space-y-4">
            <h3 className="text-xl">{title}</h3>
            <div className="p-3 rounded-lg border space-y-4">
                <p className="text-lg m-0">{createTitle}</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="space-y-1.5">
                        <NumberInput
                            value={triggerValue} onChange={(val) => {
                            setTriggerValue(Math.max(minTrigger, Math.round(val)));
                            setSelectedActionIds([]);
                            setSelectedRolesToAdd([]);
                            setSelectedRolesToRemove([]);
                        }} min={minTrigger} max={maxTrigger} step={1} label={triggerLabel}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">{actionsLabel}</label>
                        {multiple ? (
                            <Dropdown
                                multiple
                                options={filteredOptions}
                                value={selectedActionIds}
                                onChange={(val) => setSelectedActionIds(val as string[])}
                                placeholder="Choose..."
                                disabled={filteredOptions.length === 0}
                            />
                        ) : (
                            <Dropdown
                                options={filteredOptions}
                                value={selectedActionIds[0] || ""}
                                onChange={(val) => setSelectedActionIds(val ? [val as string] : [])}
                                placeholder={filteredOptions.length === 0 ? "Threshold already configured" : "Choose..."}
                                disabled={filteredOptions.length === 0}
                            />
                        )}
                    </div>

                    {flagLabel && (
                        <div className="flex items-center space-x-2.5 pb-3">
                            <input
                                type="checkbox"
                                id="ruleFlagCheckbox"
                                checked={flagValue}
                                onChange={(e) => setFlagValue(e.target.checked)}
                                className="h-5 w-4 rounded border-neutral-500 text-neutral-600 focus:ring-neutral-500 bg-transparent cursor-pointer"
                            />
                            <label
                                htmlFor="ruleFlagCheckbox" className="text-sm font-medium cursor-pointer select-none"
                            >
                                {flagLabel}
                            </label>
                        </div>
                    )}

                    <div className="flex justify-end pt-2">
                        <button
                            type="button"
                            disabled={isAddDisabled}
                            onClick={handleAddRule}
                            className="px-4 py-2 bg-neutral-300/10 hover:bg-neutral-300/15 border border-neutral-500 rounded text-sm font-medium transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isMutating ? "Saving..." : "Add"}
                        </button>
                    </div>
                </div>

                {(showRolesToAdd || showRolesToRemove) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-neutral-500/10 pt-4 mt-2">
                        {showRolesToAdd && (
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-neutral-300">Roles to Add</label>
                                <Dropdown
                                    multiple
                                    options={roleOptions}
                                    value={selectedRolesToAdd}
                                    onChange={(val) => setSelectedRolesToAdd(val as string[])}
                                    placeholder="Select roles to add..."
                                />
                            </div>
                        )}
                        {showRolesToRemove && (
                            <div className="space-y-1.5">
                                <label className="text-sm font-medium text-neutral-300">Roles to Remove</label>
                                <Dropdown
                                    multiple
                                    options={roleOptions}
                                    value={selectedRolesToRemove}
                                    onChange={(val) => setSelectedRolesToRemove(val as string[])}
                                    placeholder="Select roles to remove..."
                                />
                            </div>
                        )}
                    </div>
                )}
            </div>

            <div className="space-y-3">
                <div className="flex justify-between items-center min-h-9">
                    <h4 className="text-sm font-semibold">{activeRulesTitle}</h4>
                    {selectedActiveIds.length > 0 && (
                        <button
                            type="button"
                            disabled={isMutating}
                            onClick={handleDeleteSelected}
                            className="px-3 py-1.5 text-xs bg-red-600/90 hover:bg-red-600 text-white rounded transition font-medium disabled:opacity-50 cursor-pointer"
                        >
                            Delete Selected ({selectedActiveIds.length}) </button>
                    )}
                </div>

                {sortedRules.length === 0 ? (
                    <p className="text-sm italic text-neutral-500">{emptyText}</p>
                ) : (
                    <div className="border border-neutral-500/30 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-3 px-4 py-2.5 bg-neutral-300/10 border-b border-neutral-500/30">
                            <input
                                type="checkbox"
                                checked={isAllSelected}
                                ref={(el) => {
                                    if (el) el.indeterminate = isSomeSelected;
                                }}
                                onChange={handleToggleSelectAll}
                                disabled={isMutating}
                                className="h-4 w-4 rounded border-neutral-500 text-neutral-600 focus:ring-neutral-500 bg-transparent cursor-pointer disabled:opacity-50"
                            />
                            <span className="text-xs text-neutral-400 font-medium select-none">
                                {isAllSelected ? "Deselect All" : "Select All"}
                            </span>
                        </div>

                        <div className="divide-y divide-neutral-500/30">
                            {sortedRules.map((rule, ruleIndex) => {
                                const rowKey =
                                    rule.id !== undefined && rule.id !== null && rule.id > 0
                                        ? rule.id
                                        : `temp-rule-${rule.trigger}-${ruleIndex}`;

                                const ruleActions = safeGetArray(rule.actions);
                                const rolesToAdd = safeGetArray(rule.rolesToAdd);
                                const rolesToRemove = safeGetArray(rule.rolesToRemove);

                                return (
                                    <div
                                        key={rowKey}
                                        className="flex items-center gap-3 p-4 bg-neutral-300/5 hover:bg-neutral-300/10 transition"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedActiveIds.includes(rule.id)}
                                            onChange={() => handleToggleSelect(rule.id)}
                                            disabled={isMutating}
                                            className="h-4 w-4 rounded border-neutral-500 text-neutral-600 focus:ring-neutral-500 bg-transparent cursor-pointer disabled:opacity-50"
                                        />
                                        <div className="flex-1 flex justify-between items-center">
                                            <div className="flex items-center gap-4 flex-wrap">
                                                <span className="font-semibold text-sm">
                                                    {triggerLabel} {rule.trigger}
                                                </span>
                                                <span className="text-neutral-400 text-sm">{"->"}</span>
                                                <div className="flex flex-wrap gap-1 -mt-px">
                                                    {ruleActions.map((actId, actIndex) => {
                                                        const label = actionLabelMap.get(actId) || "Unknown";

                                                        let extraRoleText = "";
                                                        if (actId === "role_add" && rolesToAdd.length > 0) {
                                                            const roleNames = rolesToAdd
                                                                .map((rId) => roleMap[rId] || rId)
                                                                .join(", ");
                                                            extraRoleText = ` (${roleNames})`;
                                                        } else if (actId === "role_remove" && rolesToRemove.length > 0) {
                                                            const roleNames = rolesToRemove
                                                                .map((rId) => roleMap[rId] || rId)
                                                                .join(", ");
                                                            extraRoleText = ` (${roleNames})`;
                                                        }

                                                        return (
                                                            <span
                                                                key={`${rowKey}-${actId}-${actIndex}`}
                                                                className="inline-flex items-center pr-2 text-sm"
                                                            >
                                                                {actionPrefix}{label}{extraRoleText}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                                {rule.flag && flagBadgeLabel && (
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 uppercase tracking-wider font-mono">
                                                        {flagBadgeLabel}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <button
                                                    type="button"
                                                    disabled={isMutating}
                                                    onClick={() => handleDeleteSingle(rule.id)}
                                                    className="px-2.5 py-1 text-xs border border-red-500 hover:bg-red-500/10 rounded transition text-red-500 dark:text-red-400 font-medium cursor-pointer disabled:opacity-50"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}