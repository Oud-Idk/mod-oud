"use client";

import { useOptimistic, useState, useTransition } from "react";
import { XpMultiplier } from "@/utils/db/leveling";
import { Dropdown } from "@/components/Inputs/Dropdown";
import { NumberInput } from "@/components/Inputs/NumberInput";
import { getAvailableRoleOptions } from "@/utils/utils";

export interface MultiplierTabProps {
    guildId: string;
    multipliers: XpMultiplier[];
    onSave: (
        targets: Array<{ targetId: string; targetType: "channel" | "role"; multiplier: number }>
    ) => Promise<void>;
    onDelete: (targetIds: string[]) => Promise<void>;
    channelMap: Record<string, string>;
    roleMap: Record<string, string>;
}

type OptimisticAction =
    | { type: "add"; targets: XpMultiplier[] }
    | { type: "delete"; targetIds: string[] };

export function MultiplierTab({
    guildId,
    multipliers,
    onSave,
    onDelete,
    channelMap,
    roleMap,
}: MultiplierTabProps) {
    const [targetType, setTargetType] = useState<"channel" | "role">("role");
    const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
    const [multiplierValue, setMultiplierValue] = useState(1.5);
    const [isMutating, startMutation] = useTransition();

    // State to track bulk selections for active items
    const [selectedActiveIds, setSelectedActiveIds] = useState<string[]>([]);

    // Optimistic Updates hook
    const [optimisticMultipliers, setOptimisticMultipliers] = useOptimistic<
        XpMultiplier[],
        OptimisticAction
    >(multipliers, (state, action) => {
        switch (action.type) {
            case "add": {
                const currentIds = new Set(state.map((m) => m.target_id));
                const newItems = action.targets.filter((t) => !currentIds.has(t.target_id));
                return [...state, ...newItems];
            }
            case "delete": {
                const deleteSet = new Set(action.targetIds);
                return state.filter((m) => !deleteSet.has(m.target_id));
            }
            default:
                return state;
        }
    });

    const handleAddMultipliers = () => {
        if (selectedTargetIds.length === 0) return;

        const targetsToSave = selectedTargetIds.map((id) => ({
            targetId: id,
            targetType,
            multiplier: multiplierValue,
        }));

        const optimisticPayload: XpMultiplier[] = selectedTargetIds.map((id) => ({
            guild_id: guildId,
            target_id: id,
            target_type: targetType,
            multiplier: multiplierValue,
        }));

        startMutation(async () => {
            setOptimisticMultipliers({ type: "add", targets: optimisticPayload });
            setSelectedTargetIds([]); // Reset selection state

            try {
                await onSave(targetsToSave);
            } catch (err) {
                alert("Failed to save multipliers.");
            }
        });
    };

    const handleDeleteSingle = (targetId: string) => {
        if (!confirm("Are you sure you want to remove this multiplier?")) return;

        startMutation(async () => {
            setOptimisticMultipliers({ type: "delete", targetIds: [targetId] });
            setSelectedActiveIds((prev) => prev.filter((id) => id !== targetId));

            try {
                await onDelete([targetId]);
            } catch (err) {
                alert("Failed to delete multiplier.");
            }
        });
    };

    const handleDeleteSelected = () => {
        if (selectedActiveIds.length === 0) return;
        if (!confirm(`Are you sure you want to remove the ${selectedActiveIds.length} selected multiplier(s)?`)) return;

        const targetsToDelete = [...selectedActiveIds];

        startMutation(async () => {
            setOptimisticMultipliers({ type: "delete", targetIds: targetsToDelete });
            setSelectedActiveIds([]);

            try {
                await onDelete(targetsToDelete);
            } catch (err) {
                alert("Failed to delete selected multipliers.");
            }
        });
    };

    // Bulk selection helper logic
    const allActiveIds = optimisticMultipliers.map((m) => m.target_id);
    const isAllSelected = optimisticMultipliers.length > 0 && selectedActiveIds.length === optimisticMultipliers.length;
    const isSomeSelected = selectedActiveIds.length > 0 && selectedActiveIds.length < optimisticMultipliers.length;

    const handleToggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedActiveIds([]);
        } else {
            setSelectedActiveIds(allActiveIds);
        }
    };

    const handleToggleSelect = (targetId: string) => {
        setSelectedActiveIds((prev) =>
            prev.includes(targetId)
                ? prev.filter((id) => id !== targetId)
                : [...prev, targetId]
        );
    };

    // Filter out options that already have active multipliers applied (using optimistic array)
    const excludedIds = (optimisticMultipliers || []).map((m) => m.target_id);

    const filteredOptions = targetType === "role"
        ? getAvailableRoleOptions(roleMap, excludedIds)
        : Object.entries(channelMap)
            .filter(([id]) => !optimisticMultipliers.some((m) => m.target_id === id))
            .map(([id, name]) => ({ value: id, label: `#${name}` }));

    return (
        <div className="space-y-4">
            <h3 className="text-xl">XP Multipliers</h3>

            <div className="p-3 rounded-lg border space-y-4">
                <p className="text-lg m-0">Apply New Multipliers</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Type</label>
                        <Dropdown
                            options={[
                                { value: "role", label: "Role" },
                                { value: "channel", label: "Channel" },
                            ]} value={targetType} onChange={(val) => {
                            setTargetType(val as "channel" | "role");
                            setSelectedTargetIds([]);
                        }}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">
                            {targetType === "role" ? "Roles" : "Channels"}
                        </label>
                        <Dropdown
                            multiple
                            options={filteredOptions}
                            value={selectedTargetIds}
                            onChange={(val) => setSelectedTargetIds(val as string[])}
                            placeholder={targetType === "role" ? "Choose roles..." : "Choose channels..."}
                            disabled={filteredOptions.length === 0}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <NumberInput
                            value={+multiplierValue.toFixed(1)}
                            onChange={setMultiplierValue}
                            min={0.1}
                            max={10.0}
                            step={0.1}
                            label="Multiplier"
                        />
                    </div>

                    <div className="flex justify-end pt-2">
                        <button
                            type="button"
                            disabled={selectedTargetIds.length === 0 || isMutating}
                            onClick={handleAddMultipliers}
                            className="px-4 py-2 bg-neutral-300/10 hover:bg-neutral-300/15 border border-neutral-500 rounded text-sm font-medium transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isMutating ? "Saving..." : "Add"}
                        </button>
                    </div>
                </div>
            </div>

            <div className="space-y-3">
                <div className="flex justify-between items-center min-h-9">
                    <h4 className="text-sm font-semibold">Active Multipliers</h4>
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

                {optimisticMultipliers.length === 0 ? (
                    <p className="text-sm italic text-neutral-500">No custom multipliers configured.</p>
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
                            {optimisticMultipliers.map((m) => {
                                const displayName = m.target_type === "role"
                                    ? (roleMap[m.target_id] ? `@${roleMap[m.target_id]}` : `@Unknown Role`)
                                    : (channelMap[m.target_id] ? `#${channelMap[m.target_id]}` : `#Unknown Channel`);

                                return (
                                    <div
                                        key={m.target_id}
                                        className="flex items-center gap-3 p-4 bg-neutral-300/5 hover:bg-neutral-300/10 transition"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedActiveIds.includes(m.target_id)}
                                            onChange={() => handleToggleSelect(m.target_id)}
                                            disabled={isMutating}
                                            className="h-4 w-4 rounded border-neutral-500 text-neutral-600 focus:ring-neutral-500 bg-transparent cursor-pointer disabled:opacity-50"
                                        />
                                        <div className="flex-1 flex justify-between items-center">
                                            <div className="flex items-center gap-4 flex-wrap">
                                                <span className="font-semibold text-sm">
                                                    {displayName}
                                                </span>
                                                {/* Clean Badge Style matching other tabs */}
                                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 uppercase tracking-wider font-mono">
                                                    {m.target_type}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="font-mono text-sm font-bold text-neutral-900 dark:text-neutral-100">
                                                    {m.multiplier.toFixed(1)}x
                                                </span>
                                                <button
                                                    type="button"
                                                    disabled={isMutating}
                                                    onClick={() => handleDeleteSingle(m.target_id)}
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