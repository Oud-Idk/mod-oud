"use client";

import { JSX } from "react";
import { Button } from "@/components/ui/inputs/Button";
import { InputLabel } from "@/components/layout/InputLabel";
import { Dropdown } from "@/components/ui/inputs/Dropdown";
import { NumberInput } from "@/components/ui/inputs/NumberInput";
import { EconomyItem, ItemRequirement } from "@/features/economy/types";
import { QuantitiesEditor } from "./QuantitiesEditor";
import {
    TRIGGER_OPTIONS,
    REQ_TYPE_OPTIONS,
    MATCH_TYPE_OPTIONS,
    parseReqType,
    parseMatchType,
    getRequirementMatchType,
} from "./itemFormOptions";

interface ItemRequirementsSectionProps {
    requirements: ItemRequirement[];
    roleOptions: { value: string; label: string }[];
    allItems: EconomyItem[];
    currentItemId: string | undefined;
    currencyName: string;
    onChange: (requirements: ItemRequirement[]) => void;
}

export function ItemRequirementsSection({
    requirements,
    roleOptions,
    allItems,
    currentItemId,
    currencyName,
    onChange,
}: ItemRequirementsSectionProps): JSX.Element {
    const handleAddRequirement = (): void => {
        const newReq: ItemRequirement = {
            type: "ROLE",
            matchType: "EVERY",
            triggerFlags: 1,
            roleIds: [],
        };
        onChange([...requirements, newReq]);
    };

    const handleUpdateRequirement = (index: number, updated: ItemRequirement): void => {
        const next = [...requirements];
        next[index] = updated;
        onChange(next);
    };

    const handleRemoveRequirement = (index: number): void => {
        onChange(requirements.filter((_, i) => i !== index));
    };

    return (
        <>
        {/* Requirements Section */}
        <div className="pt-6 border-t border-border-subtle space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <InputLabel className="mb-0">Requirements (Validation Gates)</InputLabel>
                    <p className="text-xs text-muted-foreground">
                        Restrict who can purchase or use this item based on roles, items, or
                        balance.
                    </p>
                </div>
                <Button onClick={handleAddRequirement}>+ Add Requirement</Button>
            </div>

            {requirements.length === 0 ? (
                <div
                    className="p-4 border border-dashed border-border-subtle rounded-lg text-center text-xs text-muted-foreground">
                    No requirements set. Anyone can buy and use this item.
                </div>
            ) : (
                <div className="space-y-3">
                    {requirements.map((req, idx) => (
                        <div
                            key={idx}
                            className="p-3.5 rounded-lg border border-border bg-surface-active/20 space-y-3"
                        >
                            <div
                                className="flex items-center justify-between gap-2 border-b border-border-subtle pb-2">
                                <span className="text-xs font-semibold text-foreground">
                                    Requirement #{idx + 1}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        handleRemoveRequirement(idx);
                                    }}
                                    className="text-xs text-muted-foreground hover:text-danger transition cursor-pointer"
                                >
                                    ✕ Remove
                                </button>
                            </div>

                            <div
                                className={`grid grid-cols-1 gap-3 ${req.type === "TOTAL_BALANCE" ? "md:grid-cols-2" : "md:grid-cols-3"}`}
                            >
                                <div>
                                    <InputLabel>Trigger</InputLabel>
                                    <Dropdown
                                        options={TRIGGER_OPTIONS}
                                        value={String(req.triggerFlags)}
                                        onChange={(val) => {
                                            const nextFlags = Number(val ?? 1);
                                            if (req.type === "ROLE") {
                                                handleUpdateRequirement(idx, {
                                                    ...req,
                                                    triggerFlags: nextFlags
                                                });
                                            } else if (req.type === "TOTAL_BALANCE") {
                                                handleUpdateRequirement(idx, {
                                                    ...req,
                                                    triggerFlags: nextFlags
                                                });
                                            } else {
                                                handleUpdateRequirement(idx, {
                                                    ...req,
                                                    triggerFlags: nextFlags
                                                });
                                            }
                                        }}
                                    />
                                </div>
                                <div>
                                    <InputLabel>Type</InputLabel>
                                    <Dropdown
                                        options={REQ_TYPE_OPTIONS}
                                        value={req.type}
                                        onChange={(val) => {
                                            const newType = parseReqType(val);
                                            if (newType === "ROLE") {
                                                handleUpdateRequirement(idx, {
                                                    type: "ROLE",
                                                    matchType: "EVERY",
                                                    triggerFlags: req.triggerFlags,
                                                    roleIds: [],
                                                });
                                            } else if (newType === "TOTAL_BALANCE") {
                                                handleUpdateRequirement(idx, {
                                                    type: "TOTAL_BALANCE",
                                                    triggerFlags: req.triggerFlags,
                                                    balance: 0,
                                                });
                                            } else {
                                                handleUpdateRequirement(idx, {
                                                    type: "ITEM",
                                                    matchType: "EVERY",
                                                    triggerFlags: req.triggerFlags,
                                                    quantities: {},
                                                });
                                            }
                                        }}
                                    />
                                </div>
                                {req.type !== "TOTAL_BALANCE" && (
                                    <div>
                                        <InputLabel>Match Mode</InputLabel>
                                        <Dropdown
                                            options={MATCH_TYPE_OPTIONS}
                                            value={getRequirementMatchType(req)}
                                            onChange={(val) => {
                                                const next = parseMatchType(val);
                                                if (req.type === "ROLE") {
                                                    const updated: ItemRequirement = {
                                                        ...req,
                                                        matchType: next
                                                    };
                                                    handleUpdateRequirement(idx, updated);
                                                } else {
                                                    const updated: ItemRequirement = {
                                                        ...req,
                                                        matchType: next
                                                    };
                                                    handleUpdateRequirement(idx, updated);
                                                }
                                            }}
                                        />
                                    </div>
                                )}
                            </div>

                            {req.type === "TOTAL_BALANCE" && (
                                <div className="space-y-1">
                                    <InputLabel>Required Balance ({currencyName})</InputLabel>
                                    <NumberInput
                                        value={req.balance}
                                        placeholder="5000"
                                        onChange={(val) => {
                                            handleUpdateRequirement(idx, {
                                                ...req,
                                                balance: val ?? 0,
                                            });
                                        }}
                                    />
                                </div>
                            )}

                            {req.type === "ROLE" && (
                                <div className="space-y-1">
                                    <InputLabel>Required Discord Roles</InputLabel>
                                    <Dropdown
                                        multiple={true}
                                        options={roleOptions}
                                        value={req.roleIds}
                                        placeholder="Select roles..."
                                        onChange={(selectedRoleIds) => {
                                            handleUpdateRequirement(idx, {
                                                ...req,
                                                roleIds: selectedRoleIds,
                                            });
                                        }}
                                    />
                                </div>
                            )}

                            {req.type === "ITEM" && (
                                <div className="space-y-1">
                                    <InputLabel>Required Items</InputLabel>
                                    <QuantitiesEditor
                                        quantities={req.quantities}
                                        allItems={allItems}
                                        currentItemId={currentItemId}
                                        onChange={(nextQuantities) => {
                                            handleUpdateRequirement(idx, {
                                                ...req,
                                                quantities: nextQuantities,
                                            });
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>

        </>
    );
}
