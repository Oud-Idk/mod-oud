"use client";

import React, { useState } from "react";
import { getAvailableRoleOptions } from "@/features/_shared/dropdown";
import { LevelReward } from "@/features/leveling/types";
import { Dropdown } from "@/components/ui/Dropdown";

export interface LevelRewardsTabProps {
    guildId: string;
    rewards: LevelReward[];
    onSave: (
        rewards: Array<{ levelRequirement: number; rolesToAdd: string[]; removePreviousRoles: boolean }>
    ) => Promise<void>;
    onDelete: (ids: number[]) => Promise<void>;
    roleMap: Record<string, string>;
}

interface RewardItemState {
    id?: number;
    levelRequirement: number;
    rolesToAdd: string[];
    removePreviousRoles: boolean;
}

export function RewardTab({
    guildId,
    rewards,
    onSave,
    onDelete,
    roleMap,
}: LevelRewardsTabProps) {
    const availableRoles = getAvailableRoleOptions(roleMap);
    // Map database rewards (snake_case) to camelCase local state
    const [localRewards, setLocalRewards] = useState<RewardItemState[]>(() =>
        rewards.map((r) => ({
            id: r.id,
            levelRequirement: r.level_requirement ?? 1,
            rolesToAdd: r.roles_to_add ?? [],
            removePreviousRoles: r.remove_previous_roles ?? false,
        }))
    );

    const [deletedIds, setDeletedIds] = useState<number[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const handleAddReward = () => {
        const nextLevel =
            localRewards.length > 0
                ? Math.max(...localRewards.map((r) => r.levelRequirement)) + 5
                : 5;

        setLocalRewards((prev) => [
            ...prev,
            {
                levelRequirement: nextLevel,
                rolesToAdd: [],
                removePreviousRoles: false,
            },
        ]);
    };

    const handleRemoveReward = (index: number) => {
        const itemToRemove = localRewards[index];
        if (itemToRemove.id) {
            setDeletedIds((prev) => [...prev, itemToRemove.id!]);
        }
        setLocalRewards((prev) => prev.filter((_, i) => i !== index));
    };

    const updateReward = <K extends keyof RewardItemState>(
        index: number,
        field: K,
        value: RewardItemState[K]
    ) => {
        setLocalRewards((prev) =>
            prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
        );
    };

    const handleSaveAll = async () => {
        setIsSaving(true);
        try {
            if (deletedIds.length > 0) {
                await onDelete(deletedIds);
                setDeletedIds([]);
            }
            await onSave(
                localRewards.map((r) => ({
                    levelRequirement: Number(r.levelRequirement),
                    rolesToAdd: r.rolesToAdd,
                    removePreviousRoles: r.removePreviousRoles,
                }))
            );
        } catch (err) {
            console.error("Failed to save level rewards:", err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-4 border-b border-neutral-800 pb-4">
                <div>
                    <h3 className="text-lg font-semibold text-white">Level Rewards</h3>
                    <p className="text-xs text-neutral-400">
                        Automatically assign roles to members when they hit specific levels.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleAddReward}
                        className="px-3.5 py-2 text-sm font-medium bg-neutral-800 hover:bg-neutral-700 text-white rounded border border-neutral-700 transition cursor-pointer"
                    >
                        + Add Reward
                    </button>
                    <button
                        type="button"
                        onClick={handleSaveAll}
                        disabled={isSaving}
                        className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded transition disabled:opacity-50 cursor-pointer"
                    >
                        {isSaving ? "Saving..." : "Save Changes"}
                    </button>
                </div>
            </div>

            {localRewards.length === 0 && (
                <div className="text-center py-12 border border-dashed border-neutral-800 rounded-lg bg-neutral-900/50">
                    <p className="text-sm text-neutral-400">No level rewards configured yet.</p>
                    <button
                        type="button"
                        onClick={handleAddReward}
                        className="mt-3 text-xs text-indigo-400 hover:underline cursor-pointer"
                    >
                        Create your first level reward rule
                    </button>
                </div>
            )}

            <div className="space-y-4">
                {localRewards.map((reward, index) => (
                    <div
                        key={reward.id ?? `new-${index}`}
                        className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4 transition hover:border-neutral-700"
                    >
                        <div className="flex items-center justify-between border-b border-neutral-800/60 pb-3">
                            <span className="text-sm font-semibold text-indigo-400">
                                Reward Rule #{index + 1}
                            </span>
                            <button
                                type="button"
                                onClick={() => handleRemoveReward(index)}
                                className="text-xs text-red-400 hover:text-red-300 transition hover:bg-red-500/10 px-2.5 py-1 rounded border border-red-500/30 cursor-pointer"
                            >
                                Delete Rule
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label className="block text-xs font-medium text-neutral-300">
                                    Level Requirement
                                </label>
                                <input
                                    type="number"
                                    min="1"
                                    value={reward.levelRequirement}
                                    onChange={(e) =>
                                        updateReward(
                                            index,
                                            "levelRequirement",
                                            Math.max(1, parseInt(e.target.value) || 1)
                                        )
                                    }
                                    className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                                />
                            </div>

                            <div className="space-y-1.5">
                                <label className="block text-xs font-medium text-neutral-300">
                                    Roles To Grant
                                </label>
                                <Dropdown
                                    multiple
                                    options={availableRoles}
                                    value={reward.rolesToAdd}
                                    onChange={(selectedRoles) =>
                                        updateReward(index, "rolesToAdd", selectedRoles)
                                    }
                                    placeholder="Select roles to grant..."
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t border-neutral-800/60">
                            <div className="space-y-0.5">
                                <span className="text-xs font-medium text-neutral-200 block">
                                    Remove Previous Leveling Roles
                                </span>
                                <span className="text-[11px] text-neutral-500 block">
                                    Strips lower-tier level roles when unlocking this reward.
                                </span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={reward.removePreviousRoles}
                                    onChange={(e) =>
                                        updateReward(index, "removePreviousRoles", e.target.checked)
                                    }
                                    className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-neutral-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
                            </label>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}