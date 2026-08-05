"use client";

import React, { useState, ReactNode } from "react";
import {
    WarnThreshold,
    ModerationAction,
    SaveWarnThresholdInput,
} from "@/features/warns/types";
import {
    saveWarnThresholdsAction,
    deleteWarnThresholdsAction,
} from "@/features/warns/actions";
import { Dropdown } from "@/components/ui/Dropdown";
import { getAvailableRoleOptions } from "@/features/_shared/dropdown";

export interface WarnThresholdTabProps {
    guildId: string;
    thresholds: WarnThreshold[];
    roleMap: Record<string, string>;
}

interface LocalThresholdState {
    id?: number;
    warnCount: number;
    actionType: ModerationAction[];
    rolesToAdd: string[];
    rolesToRemove: string[];
    duration: number | null; // In minutes
}

const PUNISHMENT_OPTIONS: Array<{ value: ModerationAction; label: string }> = [
    { value: "TIMEOUT", label: "Timeout User" },
    { value: "KICK", label: "Kick User" },
    { value: "BAN", label: "Ban User" },
    { value: "ROLE_ADD", label: "Add Role" },
    { value: "ROLE_REMOVE", label: "Remove Role" },
    { value: "ROLE_REMOVE_ALL", label: "Remove All Roles" },
];

export function WarnThresholdTab({
    guildId,
    thresholds,
    roleMap,
}: WarnThresholdTabProps): ReactNode {
    const availableRoles = getAvailableRoleOptions(roleMap);

    // Map initial server prop to local state
    const [localThresholds, setLocalThresholds] = useState<LocalThresholdState[]>(() =>
        thresholds.map((t) => ({
            id: t.id,
            warnCount: t.warn_count,
            actionType: t.action_type || [],
            rolesToAdd: t.roles_to_add || [],
            rolesToRemove: t.roles_to_remove || [],
            duration: t.duration || null,
        }))
    );

    const [deletedIds, setDeletedIds] = useState<number[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    // ➕ Add a new blank threshold rule
    const handleAddThreshold = () => {
        const nextWarnCount =
            localThresholds.length > 0
                ? Math.max(...localThresholds.map((t) => t.warnCount)) + 1
                : 3;

        setLocalThresholds((prev) => [
            ...prev,
            {
                warnCount: nextWarnCount,
                actionType: ["TIMEOUT"],
                rolesToAdd: [],
                rolesToRemove: [],
                duration: 10, // 10 mins default
            },
        ]);
    };

    const handleRemoveThreshold = (index: number) => {
        const itemToRemove = localThresholds[index];
        const idToDelete = itemToRemove?.id;

        if (idToDelete !== undefined) {
            setDeletedIds((prev) => [...prev, idToDelete]);
        }

        setLocalThresholds((prev) => prev.filter((_, i) => i !== index));
    };

    const updateThreshold = <K extends keyof LocalThresholdState>(
        index: number,
        field: K,
        value: LocalThresholdState[K]
    ) => {
        setLocalThresholds((prev) =>
            prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
        );
    };

    // 💾 Save Changes
    const handleSaveAll = async () => {
        setIsSaving(true);
        try {
            // Delete queued items
            if (deletedIds.length > 0) {
                await deleteWarnThresholdsAction(guildId, deletedIds);
                setDeletedIds([]);
            }

            // Clean & format payload
            const payload: SaveWarnThresholdInput[] = localThresholds.map((t) => ({
                warnCount: Number(t.warnCount),
                actionType: t.actionType,
                rolesToAdd: t.actionType.includes("ROLE_ADD") ? t.rolesToAdd : [],
                rolesToRemove: t.actionType.includes("ROLE_REMOVE") ? t.rolesToRemove : [],
                duration: t.actionType.includes("TIMEOUT") ? (t.duration ? Number(t.duration) : null) : null,
            }));

            await saveWarnThresholdsAction(guildId, payload);
        } catch (err) {
            console.error("Failed to save warn thresholds:", err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="space-y-6 pt-4">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4 border-b border-neutral-800 pb-4">
                <div>
                    <h3 className="text-lg font-semibold text-white">Action Thresholds</h3>
                    <p className="text-xs text-neutral-400">
                        Automatically punish users when they reach a specific number of active warnings.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={handleAddThreshold}
                        className="px-3.5 py-2 text-sm font-medium bg-neutral-800 hover:bg-neutral-700 text-white rounded border border-neutral-700 transition cursor-pointer"
                    >
                        + Add Threshold
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

            {/* Empty State */}
            {localThresholds.length === 0 && (
                <div className="text-center py-12 border border-dashed border-neutral-800 rounded-lg bg-neutral-900/50">
                    <p className="text-sm text-neutral-400">No warn thresholds set up yet.</p>
                    <button
                        type="button"
                        onClick={handleAddThreshold}
                        className="mt-3 text-xs text-indigo-400 hover:underline cursor-pointer"
                    >
                        Create your first automated action
                    </button>
                </div>
            )}

            {/* Threshold List */}
            <div className="space-y-4">
                {localThresholds.map((threshold, index) => {
                    const hasTimeout = threshold.actionType.includes("TIMEOUT");
                    const hasRoleAdd = threshold.actionType.includes("ROLE_ADD");
                    const hasRoleRemove = threshold.actionType.includes("ROLE_REMOVE");

                    return (
                        <div
                            key={threshold.id ?? `new-${index}`}
                            className="bg-neutral-900 border border-neutral-800 rounded-lg p-5 space-y-4 transition hover:border-neutral-700"
                        >
                            {/* Card Header */}
                            <div className="flex items-center justify-between border-b border-neutral-800/60 pb-3">
                                <span className="text-sm font-semibold text-indigo-400">
                                    Trigger at {threshold.warnCount} {threshold.warnCount === 1 ? "Warn" : "Warns"}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => handleRemoveThreshold(index)}
                                    className="text-xs text-red-400 hover:text-red-300 transition hover:bg-red-500/10 px-2.5 py-1 rounded border border-red-500/30 cursor-pointer"
                                >
                                    Delete Rule
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {/* Field 1: Warn Count */}
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-medium text-neutral-300">
                                        Warn Count Trigger
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        value={threshold.warnCount}
                                        onChange={(e) =>
                                            updateThreshold(
                                                index,
                                                "warnCount",
                                                Math.max(1, parseInt(e.target.value) || 1)
                                            )
                                        }
                                        className="w-full bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                                    />
                                </div>

                                {/* Field 2: Action Types Multi-Select */}
                                <div className="space-y-1.5">
                                    <label className="block text-xs font-medium text-neutral-300">
                                        Actions To Execute
                                    </label>
                                    <Dropdown
                                        multiple
                                        options={PUNISHMENT_OPTIONS}
                                        value={threshold.actionType}
                                        onChange={(selectedActions) =>
                                            updateThreshold(
                                                index,
                                                "actionType",
                                                selectedActions as ModerationAction[]
                                            )
                                        }
                                        placeholder="Select action(s)..."
                                    />
                                </div>
                            </div>

                            {/* Conditional Section: Timeout Duration */}
                            {hasTimeout && (
                                <div className="space-y-1.5 pt-2 border-t border-neutral-800/40">
                                    <label className="block text-xs font-medium text-amber-400">
                                        Timeout Duration (Minutes)
                                    </label>
                                    <input
                                        type="number"
                                        min="1"
                                        placeholder="e.g. 10"
                                        value={threshold.duration ?? ""}
                                        onChange={(e) =>
                                            updateThreshold(
                                                index,
                                                "duration",
                                                e.target.value ? parseInt(e.target.value) : null
                                            )
                                        }
                                        className="w-full max-w-xs bg-neutral-950 border border-neutral-800 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500 transition"
                                    />
                                </div>
                            )}

                            {/* Conditional Section: Roles To Add */}
                            {hasRoleAdd && (
                                <div className="space-y-1.5 pt-2 border-t border-neutral-800/40">
                                    <label className="block text-xs font-medium text-emerald-400">
                                        Roles To Add
                                    </label>
                                    <Dropdown
                                        multiple
                                        options={availableRoles}
                                        value={threshold.rolesToAdd}
                                        onChange={(roles) => updateThreshold(index, "rolesToAdd", roles)}
                                        placeholder="Select roles to assign..."
                                    />
                                </div>
                            )}

                            {/* Conditional Section: Roles To Remove */}
                            {hasRoleRemove && (
                                <div className="space-y-1.5 pt-2 border-t border-neutral-800/40">
                                    <label className="block text-xs font-medium text-rose-400">
                                        Roles To Remove
                                    </label>
                                    <Dropdown
                                        multiple
                                        options={availableRoles}
                                        value={threshold.rolesToRemove}
                                        onChange={(roles) => updateThreshold(index, "rolesToRemove", roles)}
                                        placeholder="Select roles to strip..."
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}