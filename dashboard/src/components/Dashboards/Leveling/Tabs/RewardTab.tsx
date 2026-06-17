"use client";

import { useOptimistic, useState, useTransition } from "react";
import { getAvailableRoleOptions } from "@/utils/utils";
import { NumberInput } from "@/components/NumberInput";
import { Dropdown } from "@/components/Dropdown";
import { LevelReward } from "@/utils/db/leveling";

// Note: This assumes LevelReward has been updated to use:
// roles_to_add: string[]
export interface LevelRewardsTabProps {
    guildId: string;
    rewards: LevelReward[];
    onSave: (
        rewards: Array<{ levelRequirement: number; rolesToAdd: string[]; removePreviousRoles: boolean }>
    ) => Promise<void>;
    onDelete: (ids: number[]) => Promise<void>;
    roleMap: Record<string, string>;
}

type OptimisticAction =
    | { type: "add"; rewards: LevelReward[] }
    | { type: "delete"; ids: number[] };

export function RewardTab({
    guildId,
    rewards,
    onSave,
    onDelete,
    roleMap,
}: LevelRewardsTabProps) {
    const [levelRequirement, setLevelRequirement] = useState<number>(5);
    const [selectedRoleIds, setSelectedRoleIds] = useState<string[]>([]);
    const [removePrevious, setRemovePrevious] = useState<boolean>(false);
    const [isMutating, startMutation] = useTransition();

    // State to track bulk selections for active rewards
    const [selectedActiveIds, setSelectedActiveIds] = useState<number[]>([]);

    // 1. Optimistic Updates hook
    const [optimisticRewards, setOptimisticRewards] = useOptimistic<
        LevelReward[],
        OptimisticAction
    >(rewards, (state, action) => {
        switch (action.type) {
            case "add": {
                const newState = [...state];
                for (const nr of action.rewards) {
                    const existingIndex = newState.findIndex(
                        (sr) => sr.level_requirement === nr.level_requirement
                    );
                    if (existingIndex > -1) {
                        // Merge roles avoiding duplicates if the level already exists
                        const mergedRoles = Array.from(
                            new Set([...newState[existingIndex].roles_to_add, ...nr.roles_to_add])
                        );
                        newState[existingIndex] = {
                            ...newState[existingIndex],
                            roles_to_add: mergedRoles,
                            remove_previous_roles: nr.remove_previous_roles,
                        };
                    } else {
                        newState.push(nr);
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

    const handleAddRewards = () => {
        if (selectedRoleIds.length === 0) return;

        const rewardsToSave = [
            {
                levelRequirement,
                rolesToAdd: selectedRoleIds,
                removePreviousRoles: removePrevious,
            },
        ];

        // Generate a temporary negative ID for optimistic rendering
        const optimisticPayload: LevelReward[] = [
            {
                id: -Date.now(),
                guild_id: guildId,
                level_requirement: levelRequirement,
                roles_to_add: selectedRoleIds,
                remove_previous_roles: removePrevious,
            },
        ];

        startMutation(async () => {
            setOptimisticRewards({ type: "add", rewards: optimisticPayload });
            setSelectedRoleIds([]); // Reset selection state

            try {
                await onSave(rewardsToSave);
            } catch (err) {
                alert("Failed to save level rewards.");
            }
        });
    };

    const handleDeleteSingle = (id: number) => {
        if (!confirm("Are you sure you want to remove this level reward?")) return;

        startMutation(async () => {
            setOptimisticRewards({ type: "delete", ids: [id] });
            setSelectedActiveIds((prev) => prev.filter((activeId) => activeId !== id));

            try {
                await onDelete([id]);
            } catch (err) {
                alert("Failed to delete level reward.");
            }
        });
    };

    const handleDeleteSelected = () => {
        if (selectedActiveIds.length === 0) return;
        if (!confirm(`Are you sure you want to remove the ${selectedActiveIds.length} selected level reward(s)?`)) return;

        const idsToDelete = [...selectedActiveIds];

        startMutation(async () => {
            setOptimisticRewards({ type: "delete", ids: idsToDelete });
            setSelectedActiveIds([]);

            try {
                await onDelete(idsToDelete);
            } catch (err) {
                alert("Failed to delete selected level rewards.");
            }
        });
    };

    // Sorting rewards by level requirement for readable presentation
    const sortedRewards = [...optimisticRewards].sort((a, b) => a.level_requirement - b.level_requirement);

    // Bulk selection helper logic
    const allActiveIds = sortedRewards.map((r) => r.id);
    const isAllSelected = sortedRewards.length > 0 && selectedActiveIds.length === sortedRewards.length;
    const isSomeSelected = selectedActiveIds.length > 0 && selectedActiveIds.length < sortedRewards.length;

    const handleToggleSelectAll = () => {
        if (isAllSelected) {
            setSelectedActiveIds([]);
        } else {
            setSelectedActiveIds(allActiveIds);
        }
    };

    const handleToggleSelect = (id: number) => {
        setSelectedActiveIds((prev) =>
            prev.includes(id)
                ? prev.filter((activeId) => activeId !== id)
                : [...prev, id]
        );
    };

    // Filter roles already assigned as rewards for the currently selected level
    const excludedRoleIds = optimisticRewards
        .filter((r) => r.level_requirement === levelRequirement)
        .flatMap((r) => r.roles_to_add);

    const filteredOptions = getAvailableRoleOptions(roleMap, excludedRoleIds);

    return (
        <div className="space-y-4">
            <div>
                <h3 className="text-xl">Level Rewards</h3>
                <p className="text-xs text-zinc-500 dark:text-neutral-400">
                    Assign roles to members when they reach specific level milestones. </p>
            </div>

            <div className="p-3 rounded-lg border space-y-4">
                <p className="text-lg m-0">Create New Level Reward</p>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">

                    {/* Level Requirement Input */}
                    <div className="space-y-1.5">
                        <NumberInput
                            value={levelRequirement} onChange={(val) => {
                            setLevelRequirement(Math.max(1, Math.round(val)));
                            setSelectedRoleIds([]);
                        }} min={1} max={100} step={1} label="Required Level"
                        />
                    </div>

                    {/* Roles Multi-Select Selector */}
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">
                            Roles to Add
                        </label>
                        <Dropdown
                            multiple
                            options={filteredOptions}
                            value={selectedRoleIds}
                            onChange={(val) => setSelectedRoleIds(val as string[])}
                            placeholder="Choose roles..."
                            disabled={filteredOptions.length === 0}
                        />
                    </div>

                    {/* Behavior Settings */}
                    <div className="flex items-center space-x-2.5 pb-3">
                        <input
                            type="checkbox"
                            id="removePrevious"
                            checked={removePrevious}
                            onChange={(e) => setRemovePrevious(e.target.checked)}
                            className="h-5 w-4 rounded border-neutral-500 text-neutral-600 focus:ring-neutral-500 bg-transparent cursor-pointer"
                        />
                        <label
                            htmlFor="removePrevious" className="text-sm font-medium cursor-pointer select-none"
                        >
                            Remove lower level reward roles
                        </label>
                    </div>

                    {/* Action Button */}
                    <div className="flex justify-end pt-2">
                        <button
                            type="button"
                            disabled={selectedRoleIds.length === 0 || isMutating}
                            onClick={handleAddRewards}
                            className="px-4 py-2 bg-neutral-300/10 hover:bg-neutral-300/15 border border-neutral-500 rounded text-sm font-medium transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isMutating ? "Saving..." : "Add Reward"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Listing Active Level Rewards */}
            <div className="space-y-3">
                <div className="flex justify-between items-center min-h-9">
                    <h4 className="text-sm font-semibold">Active Level Rewards</h4>
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

                {sortedRewards.length === 0 ? (
                    <p className="text-sm italic text-neutral-500">No level rewards configured.</p>
                ) : (
                    <div className="border border-neutral-500/30 rounded-lg overflow-hidden">
                        {/* Select All Header */}
                        <div
                            className="flex items-center gap-3 px-4 py-2.5 bg-neutral-300/10 border-b border-neutral-500/30"
                        >
                            <input
                                type="checkbox"
                                checked={isAllSelected}
                                ref={(el) => {
                                    if (el) {
                                        el.indeterminate = isSomeSelected;
                                    }
                                }}
                                onChange={handleToggleSelectAll}
                                disabled={isMutating}
                                className="h-4 w-4 rounded border-neutral-500 text-neutral-600 focus:ring-neutral-500 bg-transparent cursor-pointer disabled:opacity-50"
                            />
                            <span className="text-xs text-neutral-400 font-medium select-none">
                                {isAllSelected ? "Deselect All" : "Select All"}
                            </span>
                        </div>

                        {/* Items list */}
                        <div className="divide-y divide-neutral-500/30">
                            {sortedRewards.map((r, rewardIndex) => {
                                // Fallback key using id and level_requirement in case r.id is missing/undefined
                                const rowKey = r.id !== undefined && r.id !== null
                                    ? r.id
                                    : `temp-level-${r.level_requirement}-${rewardIndex}`;

                                return (
                                    <div
                                        key={rowKey}
                                        className="flex items-center gap-3 p-4 bg-neutral-300/5 hover:bg-neutral-300/10 transition"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedActiveIds.includes(r.id)}
                                            onChange={() => handleToggleSelect(r.id)}
                                            disabled={isMutating}
                                            className="h-4 w-4 rounded border-neutral-500 text-neutral-600 focus:ring-neutral-500 bg-transparent cursor-pointer disabled:opacity-50"
                                        />
                                        <div className="flex-1 flex justify-between items-center">
                                            <div className="flex items-center gap-4 flex-wrap">
                                                <span className="font-semibold text-sm">
                                                    Level {r.level_requirement}
                                                </span>
                                                <span className="text-neutral-400 text-sm">{"->"}</span>
                                                <div className="flex flex-wrap gap-1 -mt-px">
                                                    {r.roles_to_add.map((roleId, roleIndex) => {
                                                        const roleName = roleMap[roleId]
                                                            ? `@${roleMap[roleId]}`
                                                            : `@Unknown Role`;
                                                        return (
                                                            <span
                                                                // Combining rowKey and roleId with the index ensures unique keys for role elements
                                                                key={`${rowKey}-${roleId}-${roleIndex}`}
                                                                className="inline-flex items-center pr-2 text-sm"
                                                            >
                                                                {roleName}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                                {r.remove_previous_roles && (
                                                    <span
                                                        className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-500 uppercase tracking-wider font-mono"
                                                    >
                                                        Removes Previous
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <button
                                                    type="button"
                                                    disabled={isMutating}
                                                    onClick={() => handleDeleteSingle(r.id)}
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