"use client";

import React, { useState, useMemo, useEffect } from "react";
import { getAvailableRoleOptions } from "@/features/_shared/dropdown";
import { LevelReward } from "@/features/leveling/types";
import { Dropdown } from "@/components/ui/Dropdown";
import { Button } from "@/components/ui/Button";
import { InputLabel } from "@/components/layout/InputLabel";
import { NumberInput } from "@/components/ui/NumberInput";
import Footer from "@/components/layout/Footer";
import { useRouter } from "next/navigation";

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

const areArraysEqual = (a: string[], b: string[]) => {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, i) => val === sortedB[i]);
};

export function RewardTab({
    guildId,
    rewards,
    onSave,
    onDelete,
    roleMap,
}: LevelRewardsTabProps) {
    const availableRoles = getAvailableRoleOptions(roleMap);

    // Normalize initial server props for comparison
    const initialRewards = useMemo<RewardItemState[]>(() =>
            rewards.map((r) => ({
                id: r.id,
                levelRequirement: r.level_requirement ?? 1,
                rolesToAdd: r.roles_to_add ?? [],
                removePreviousRoles: r.remove_previous_roles ?? false,
            })),
        [rewards]
    );

    // Map database rewards (snake_case) to camelCase local state
    const [localRewards, setLocalRewards] = useState<RewardItemState[]>(initialRewards);
    const [deletedIds, setDeletedIds] = useState<number[]>([]);
    const [isSaving, setIsSaving] = useState(false);
    const router = useRouter();

    // Determine if any changes exist between current state and original props
    const hasChanges = useMemo(() => {
        if (deletedIds.length > 0) return true;
        if (localRewards.length !== initialRewards.length) return true;

        return localRewards.some((local, idx) => {
            const initial = initialRewards[idx];
            if (!initial) return true;

            return (
                local.id !== initial.id ||
                local.levelRequirement !== initial.levelRequirement ||
                local.removePreviousRoles !== initial.removePreviousRoles ||
                !areArraysEqual(local.rolesToAdd, initial.rolesToAdd)
            );
        });
    }, [localRewards, initialRewards, deletedIds]);

    useEffect(() => {
        setLocalRewards(initialRewards);
        setDeletedIds([]);
    }, [initialRewards]);

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
            router.refresh();
        } catch (err) {
            console.error("Failed to save level rewards:", err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-4 border-border-subtle">
                <div>
                    <h3 className="text-lg font-bold text-foreground">Level Rewards</h3>
                    <Footer>
                        Automatically assign roles to members when they hit specific levels.
                    </Footer>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        onClick={handleAddReward}
                    >
                        + Add Reward
                    </Button>
                    <Button
                        onClick={handleSaveAll}
                        disabled={isSaving || !hasChanges}
                    >
                        {isSaving ? "Saving..." : "Save Changes"}
                    </Button>
                </div>
            </div>

            {/* Empty State */}
            {localRewards.length === 0 && (
                <div className="text-center py-12 border border-dashed border-border rounded-lg bg-surface-muted/30">
                    <p className="text-sm text-muted-foreground">No level rewards configured yet.</p>
                    <button
                        type="button"
                        onClick={handleAddReward}
                        className="mt-2 text-xs font-bold text-brand hover:text-brand-hover hover:underline transition cursor-pointer"
                    >
                        Create your first level reward rule
                    </button>
                </div>
            )}

            {/* Reward Card List */}
            <div className="space-y-2">
                {localRewards.map((reward, index) => (
                    <div
                        key={reward.id ?? `new-${index}`}
                        className="bg-surface border border-border-subtle rounded-lg p-4 py-3 space-y-2 transition-colors duration-150 hover:border-border"
                    >
                        {/* Card Subheader */}
                        <div className="flex items-center justify-between border-border mb-0">
                            <span className="text-brand">Reward Rule #{index + 1}</span>
                            <Button
                                variant="danger"
                                onClick={() => handleRemoveReward(index)}
                            >
                                Delete Rule
                            </Button>
                        </div>

                        {/* Input Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <InputLabel>Level Requirement</InputLabel>
                                <NumberInput
                                    min={1}
                                    value={reward.levelRequirement}
                                    onChange={(v) =>
                                        updateReward(
                                            index,
                                            "levelRequirement",
                                            Math.max(1, v || 1)
                                        )
                                    }
                                />
                            </div>

                            <div className="space-y-1.5">
                                <InputLabel>Roles to Grant</InputLabel>
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

                        {/* Switch Footer Row */}
                        <div className="flex items-center justify-between border-border">
                            <div className="space-y-0.5">
                                <span>Strips lower-tier level roles </span>
                            </div>
                            <label className="relative inline-flex items-center cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={reward.removePreviousRoles}
                                    onChange={(e) =>
                                        updateReward(index, "removePreviousRoles", e.target.checked)
                                    }
                                    className="sr-only peer"
                                />
                                <div className="w-9 h-5 bg-surface-active rounded-full transition-all duration-150 peer-focus:outline-none peer-checked:bg-brand after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-brand-foreground after:border-border after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-full"></div>
                            </label>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}