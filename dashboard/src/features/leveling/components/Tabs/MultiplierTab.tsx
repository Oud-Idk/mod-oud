"use client";

import { JSX, useOptimistic, useState, useTransition } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { NumberInput } from "@/components/ui/NumberInput";
import { getAvailableRoleOptions } from "@/features/_shared/dropdown";
import { SaveXpMultiplierInput, TargetType, XpMultiplier, saveXpMultiplierInputSchema } from "@/features/leveling/types";
import { InputLabel } from "@/components/layout/InputLabel";
import { Button } from "@/components/ui/Button";
import Emphasis from "@/components/layout/Emphasis";
import Footer from "@/components/layout/Footer";
import { toast } from "sonner";

export interface MultiplierTabProps {
    guildId: string;
    multipliers: XpMultiplier[];
    onSave: (targets: SaveXpMultiplierInput[]) => Promise<void>;
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
}: MultiplierTabProps): JSX.Element {
    const [targetType, setTargetType] = useState<TargetType>("ROLE");
    const [selectedTargetIds, setSelectedTargetIds] = useState<string[]>([]);
    const [multiplierValue, setMultiplierValue] = useState<number | undefined>(1.5);
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

    const handleAddMultipliers = (): void => {
        if (selectedTargetIds.length === 0) {
            toast.error("Please select at least one role or channel");
            return;
        }

        const effectiveMultiplier = multiplierValue ?? 1.0;

        const targetsToSave: SaveXpMultiplierInput[] = selectedTargetIds.map((id) => ({
            targetId: id,
            targetType,
            multiplier: effectiveMultiplier,
        }));

        // Validate with Zod
        for (const target of targetsToSave) {
            const result = saveXpMultiplierInputSchema.safeParse(target);
            if (!result.success) {
                toast.error(result.error.issues[0]?.message || "Invalid multiplier configuration");
                return;
            }
        }

        const optimisticPayload: XpMultiplier[] = selectedTargetIds.map((id) => ({
            guild_id: guildId,
            target_id: id,
            target_type: targetType,
            multiplier: effectiveMultiplier,
        }));

        startMutation(async () => {
            setOptimisticMultipliers({ type: "add", targets: optimisticPayload });
            setSelectedTargetIds([]); // Reset selection state

            try {
                await onSave(targetsToSave);
                toast.success("Multipliers added successfully");
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to save multipliers");
            }
        });
    };

    const handleDeleteSingle = (targetId: string): void => {
        startMutation(async () => {
            setOptimisticMultipliers({ type: "delete", targetIds: [targetId] });
            setSelectedActiveIds((prev) => prev.filter((id) => id !== targetId));

            try {
                await onDelete([targetId]);
                toast.success("Multiplier deleted successfully");
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to delete multiplier");
            }
        });
    };

    const handleDeleteSelected = (): void => {
        if (selectedActiveIds.length === 0) return;

        const targetsToDelete = [...selectedActiveIds];

        startMutation(async () => {
            setOptimisticMultipliers({ type: "delete", targetIds: targetsToDelete });
            setSelectedActiveIds([]);

            try {
                await onDelete(targetsToDelete);
                toast.success("Multipliers deleted successfully");
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to delete selected multipliers");
            }
        });
    };

    // Bulk selection helper logic
    const allActiveIds = optimisticMultipliers.map((m) => m.target_id);
    const isAllSelected = optimisticMultipliers.length > 0 && selectedActiveIds.length === optimisticMultipliers.length;
    const isSomeSelected = selectedActiveIds.length > 0 && selectedActiveIds.length < optimisticMultipliers.length;

    const handleToggleSelectAll = (): void => {
        if (isAllSelected) {
            setSelectedActiveIds([]);
        } else {
            setSelectedActiveIds(allActiveIds);
        }
    };

    const handleToggleSelect = (targetId: string): void => {
        setSelectedActiveIds((prev) =>
            prev.includes(targetId)
                ? prev.filter((id) => id !== targetId)
                : [...prev, targetId]
        );
    };

    // Filter out options that already have active multipliers applied
    const excludedIds = (optimisticMultipliers || []).map((m) => m.target_id);

    const filteredOptions = targetType === "ROLE"
        ? getAvailableRoleOptions(roleMap, excludedIds)
        : Object.entries(channelMap)
            .filter(([id]) => !optimisticMultipliers.some((m) => m.target_id === id))
            .map(([id, name]) => ({ value: id, label: `#${name}` }));

    return (
        <div className="space-y-2">
            <div>
                <Emphasis>XP Multipliers</Emphasis>
                <Footer>
                    Configure bonus XP rates for specific roles or text channels in the server.
                </Footer>
            </div>

            <div className="p-4 rounded-lg bg-surface border border-border-subtle space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Apply New Multipliers</h2>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="space-y-1.5">
                        <InputLabel>Type</InputLabel>
                        <Dropdown
                            options={[
                                { value: "ROLE", label: "Role" },
                                { value: "CHANNEL", label: "Channel" },
                            ]}
                            value={targetType}
                            onChange={(val) => {
                                setTargetType(val ?? "CHANNEL");
                                setSelectedTargetIds([]);
                            }}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <InputLabel required>
                            {targetType === "ROLE" ? "Roles" : "Channels"}
                        </InputLabel>
                        <Dropdown
                            multiple
                            options={filteredOptions}
                            value={selectedTargetIds}
                            onChange={(val) => setSelectedTargetIds(val)}
                            placeholder={targetType === "ROLE" ? "Choose roles..." : "Choose channels..."}
                            disabled={filteredOptions.length === 0}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <InputLabel>Multiplier</InputLabel>
                        <NumberInput
                            value={+(multiplierValue ?? 0).toFixed(1)}
                            onChange={setMultiplierValue}
                            min={0.1}
                            max={10.0}
                            step={0.1}
                        />
                    </div>

                    <div className="flex justify-end pt-2">
                        <Button
                            disabled={selectedTargetIds.length === 0 || isMutating}
                            onClick={handleAddMultipliers}
                            className="w-full md:w-auto"
                        >
                            {isMutating ? "Saving..." : "Add"}
                        </Button>
                    </div>
                </div>
            </div>

            {/* Active Multipliers List */}
            <div>
                <div className="flex justify-between items-center min-h-9">
                    <Emphasis>Active Multipliers</Emphasis>
                    {selectedActiveIds.length > 0 && (
                        <button
                            type="button"
                            disabled={isMutating}
                            onClick={handleDeleteSelected}
                            className="px-3 py-1.5 text-xs bg-danger hover:bg-danger-hover text-brand-foreground font-bold uppercase tracking-wider rounded transition-all duration-150 cursor-pointer focus-ring-danger disabled:opacity-50"
                        >
                            Delete Selected ({selectedActiveIds.length})
                        </button>
                    )}
                </div>

                {optimisticMultipliers.length === 0 ? (
                    <div className="p-8 border border-dashed border-border rounded-lg text-center bg-surface-muted/30">
                        <p className="text-sm text-muted-foreground">No custom multipliers configured.</p>
                    </div>
                ) : (
                    <div className="border border-border rounded-lg overflow-hidden bg-surface shadow-sm">

                        {/* Select All Header */}
                        <div className="flex items-center gap-3 px-4 py-3 bg-surface-muted border-b border-border">
                            <input
                                type="checkbox"
                                checked={isAllSelected}
                                ref={(el) => {
                                    if (el) el.indeterminate = isSomeSelected;
                                }}
                                onChange={handleToggleSelectAll}
                                disabled={isMutating}
                                className="h-4 w-4 rounded border-border bg-surface text-brand cursor-pointer focus-ring disabled:opacity-50"
                            />
                            <span className="text-xs text-muted-foreground font-semibold select-none">
                                {isAllSelected ? "Deselect All" : "Select All"}
                            </span>
                        </div>

                        {/* List Items */}
                        <div className="divide-y divide-border">
                            {optimisticMultipliers.map((m) => {
                                const displayName = m.target_type === "ROLE"
                                    ? (roleMap[m.target_id] ? `@${roleMap[m.target_id]}` : `@Unknown Role`)
                                    : (channelMap[m.target_id] ? `#${channelMap[m.target_id]}` : `#Unknown Channel`);

                                return (
                                    <div
                                        key={m.target_id}
                                        className="flex items-center gap-3 p-4 bg-surface hover:bg-surface-active/20 transition-colors duration-150"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedActiveIds.includes(m.target_id)}
                                            onChange={() => handleToggleSelect(m.target_id)}
                                            disabled={isMutating}
                                            className="h-4 w-4 rounded border-border bg-surface text-brand cursor-pointer focus-ring disabled:opacity-50"
                                        />
                                        <div className="flex-1 flex justify-between items-center">
                                            <div className="flex items-center gap-4 flex-wrap">
                                                <span className="font-bold text-sm text-foreground">
                                                    {displayName}
                                                </span>
                                                <span className="text-[10px] px-2 py-0.5 rounded bg-brand-subtle border border-brand/10 text-brand uppercase tracking-wider font-mono font-bold">
                                                    {m.target_type}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="font-mono text-sm text-foreground">
                                                    {m.multiplier.toFixed(1)}x
                                                </span>
                                                <Button
                                                    variant="danger"
                                                    disabled={isMutating}
                                                    onClick={() => handleDeleteSingle(m.target_id)}
                                                    className="px-3 py-1"
                                                >
                                                    Delete
                                                </Button>
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