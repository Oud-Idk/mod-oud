"use client";

import React, { JSX, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { InputLabel } from "@/components/layout/InputLabel";
import Footer from "@/components/layout/Footer";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { NumberInput } from "@/components/ui/NumberInput";
import { getAvailableRoleOptions } from "@/features/_shared/dropdown";
import { toast } from "sonner";

import {
    deleteWarnThresholdsAction,
    saveWarnThresholdsAction,
} from "../../actions";
import {
    saveWarnThresholdsInputSchema,
    type ModerationAction,
    type SaveWarnThresholdInput,
    type WarnThreshold,
} from "../../types";

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
    duration: number | null;
}

const PUNISHMENT_OPTIONS: { value: ModerationAction; label: string }[] = [
    { value: "TIMEOUT", label: "Timeout User" },
    { value: "KICK", label: "Kick User" },
    { value: "BAN", label: "Ban User" },
    { value: "ROLE_ADD", label: "Add Role" },
    { value: "ROLE_REMOVE", label: "Remove Role" },
    { value: "ROLE_REMOVE_ALL", label: "Remove All Roles" },
];

const areArraysEqual = (a: string[], b: string[]): boolean => {
    if (a.length !== b.length) return false;
    const sortedA = [...a].sort();
    const sortedB = [...b].sort();
    return sortedA.every((val, i) => val === sortedB[i]);
};

export function WarnThresholdTab({
    guildId,
    thresholds,
    roleMap,
}: WarnThresholdTabProps): JSX.Element {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const initialThresholds = useMemo<LocalThresholdState[]>(
        () =>
            thresholds.map((t) => ({
                id: t.id,
                warnCount: t.warn_count,
                actionType: t.action_type,
                rolesToAdd: t.roles_to_add ?? [],
                rolesToRemove: t.roles_to_remove ?? [],
                duration: t.duration ?? null,
            })),
        [thresholds]
    );

    const [localThresholds, setLocalThresholds] = useState<LocalThresholdState[]>(initialThresholds);
    const [deletedIds, setDeletedIds] = useState<number[]>([]);

    const isDirty = useMemo((): boolean => {
        if (deletedIds.length > 0) return true;
        if (localThresholds.length !== initialThresholds.length) return true;

        return localThresholds.some((local, idx) => {
            const initial = initialThresholds[idx];

            return (
                local.id !== initial.id ||
                local.warnCount !== initial.warnCount ||
                local.duration !== initial.duration ||
                !areArraysEqual(local.actionType, initial.actionType) ||
                !areArraysEqual(local.rolesToAdd, initial.rolesToAdd) ||
                !areArraysEqual(local.rolesToRemove, initial.rolesToRemove)
            );
        });
    }, [localThresholds, initialThresholds, deletedIds]);

    const handleAddThreshold = (): void => {
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
                duration: 10,
            },
        ]);
    };

    const handleRemoveThreshold = (index: number): void => {
        const itemToRemove = localThresholds[index];
        if (itemToRemove.id !== undefined) {
            const deletedId = itemToRemove.id;
            setDeletedIds((prev) => [...prev, deletedId]);
        }
        setLocalThresholds((prev) => prev.filter((_, i) => i !== index));
    };

    const updateThreshold = <K extends keyof LocalThresholdState>(
        index: number,
        field: K,
        value: LocalThresholdState[K]
    ): void => {
        setLocalThresholds((prev) =>
            prev.map((item, i) => (i === index ? { ...item, [field]: value } : item))
        );
    };

    const handleCancel = (): void => {
        setLocalThresholds(initialThresholds);
        setDeletedIds([]);
    };

    const handleSaveAll = (): void => {
        const payload: SaveWarnThresholdInput[] = localThresholds.map((t) => ({
            warnCount: t.warnCount,
            actionType: t.actionType,
            rolesToAdd: t.actionType.includes("ROLE_ADD") ? t.rolesToAdd : [],
            rolesToRemove: t.actionType.includes("ROLE_REMOVE") ? t.rolesToRemove : [],
            duration: t.actionType.includes("TIMEOUT") ? t.duration : null,
        }));

        const validation = saveWarnThresholdsInputSchema.safeParse(payload);
        if (!validation.success) {
            toast.error(validation.error.issues[0].message);
            return;
        }

        startTransition(async () => {
            try {
                if (deletedIds.length > 0) {
                    await deleteWarnThresholdsAction(guildId, deletedIds);
                }
                await saveWarnThresholdsAction(guildId, payload);
                setDeletedIds([]);
                toast.success("Warn thresholds saved successfully");
                router.refresh();
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to save warn thresholds.");
            }
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-4 border-border-subtle">
                <div>
                    <h3 className="text-lg font-bold text-foreground">Action Thresholds</h3>
                    <Footer>
                        Automatically punish users when they reach a specific number of active warnings.
                    </Footer>
                </div>
                <Button variant="secondary" onClick={handleAddThreshold}>
                    + Add Threshold
                </Button>
            </div>

            {localThresholds.length === 0 && (
                <div className="text-center py-12 border border-dashed border-border rounded-lg bg-surface-muted/30">
                    <p className="text-sm text-muted-foreground">No warn thresholds set up yet.</p>
                    <button
                        type="button"
                        onClick={handleAddThreshold}
                        className="mt-2 text-xs font-bold text-brand hover:text-brand-hover hover:underline transition cursor-pointer"
                    >
                        Create your first automated action
                    </button>
                </div>
            )}

            <div className="space-y-3">
                {localThresholds.map((threshold, index) => {
                    const hasTimeout = threshold.actionType.includes("TIMEOUT");
                    const hasRoleAdd = threshold.actionType.includes("ROLE_ADD");
                    const hasRoleRemove = threshold.actionType.includes("ROLE_REMOVE");

                    return (
                        <div
                            key={threshold.id !== undefined ? String(threshold.id) : `new-${String(index)}`}
                            className="bg-surface border border-border-subtle rounded-lg p-4 py-3 space-y-3 transition-colors duration-150 hover:border-border"
                        >
                            <div className="flex items-center justify-between border-b border-border-subtle pb-2">
                                <span className="text-xs font-bold text-brand uppercase tracking-wider">
                                    Threshold Rule #{index + 1}
                                </span>
                                <Button variant="danger" onClick={() => { handleRemoveThreshold(index); }}>
                                    Delete Rule
                                </Button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <InputLabel>Warn Count Trigger</InputLabel>
                                    <NumberInput
                                        min={1}
                                        value={threshold.warnCount}
                                        onChange={(v) => {
                                            updateThreshold(index, "warnCount", Math.max(1, v ?? 1));
                                        }}
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <InputLabel>Actions To Execute</InputLabel>
                                    <Dropdown<ModerationAction>
                                        multiple
                                        options={PUNISHMENT_OPTIONS}
                                        value={threshold.actionType}
                                        onChange={(selectedActions) => {
                                            updateThreshold(
                                                index,
                                                "actionType",
                                                selectedActions
                                            );
                                        }}
                                        placeholder="Select action(s)..."
                                    />
                                </div>
                            </div>

                            {(hasTimeout || hasRoleAdd || hasRoleRemove) && (
                                <div className="space-y-3 pt-2 border-t border-border-subtle">
                                    {hasTimeout && (
                                        <div className="space-y-1">
                                            <InputLabel>Timeout Duration (Minutes)</InputLabel>
                                            <NumberInput
                                                min={1}
                                                placeholder="e.g. 10"
                                                value={threshold.duration ?? undefined}
                                                onChange={(v) => { updateThreshold(index, "duration", v ?? null); }}
                                            />
                                        </div>
                                    )}

                                    {hasRoleAdd && (
                                        <div className="space-y-1.5">
                                            <InputLabel>Roles To Add</InputLabel>
                                            <Dropdown
                                                multiple
                                                options={getAvailableRoleOptions(roleMap)}
                                                value={threshold.rolesToAdd}
                                                onChange={(roles) => { updateThreshold(index, "rolesToAdd", roles); }}
                                                placeholder="Select roles to assign..."
                                            />
                                        </div>
                                    )}

                                    {hasRoleRemove && (
                                        <div className="space-y-1.5">
                                            <InputLabel>Roles To Remove</InputLabel>
                                            <Dropdown
                                                multiple
                                                options={getAvailableRoleOptions(roleMap)}
                                                value={threshold.rolesToRemove}
                                                onChange={(roles) => { updateThreshold(index, "rolesToRemove", roles); }}
                                                placeholder="Select roles to strip..."
                                            />
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={handleSaveAll}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}