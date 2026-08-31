"use client";

import React, { JSX, useState } from "react";
import { useRouter } from "next/navigation";
import { TextInput } from "@/components/ui/inputs/TextInput";
import { NumberInput } from "@/components/ui/inputs/NumberInput";
import { ToggleSwitch } from "@/components/ui/inputs/ToggleSwitch";
import { Button } from "@/components/ui/inputs/Button";
import { InputLabel } from "@/components/layout/InputLabel";
import { Dropdown } from "@/components/ui/inputs/Dropdown";
import {
    EconomyItem,
    EconomyCategory,
    ItemRequirement,
    ItemAction,
    DEFAULT_ITEM_MESSAGE
} from "@/features/economy/types";
import { EconomyCategoryCreateModal } from "./EconomyCategoryCreateModal";

interface ItemConfigProps {
    config: EconomyItem;
    allItems: EconomyItem[];
    categories: EconomyCategory[];
    isPending: boolean;
    currencyName: string;
    roleMap: Record<string, string>;
    guildId: string;
    onDelete: (id: string) => Promise<boolean>;
    onChange: (updated: EconomyItem) => void;
    onSaveCategory: (category: EconomyCategory) => Promise<EconomyCategory>;
}

const TRIGGER_OPTIONS = [
    { label: "On Buy", value: "1" },
    { label: "On Use", value: "2" },
    { label: "On Buy & Use", value: "3" },
];

const REQ_TYPE_OPTIONS = [
    { label: "Role Requirement", value: "ROLE" },
    { label: "Total Balance Requirement", value: "TOTAL_BALANCE" },
    { label: "Item Ownership Requirement", value: "ITEM" },
];

const MATCH_TYPE_OPTIONS = [
    { label: "Must have ALL (Every)", value: "EVERY" },
    { label: "Must have AT LEAST ONE (Any)", value: "AT_LEAST_ONE" },
    { label: "Must have NONE (Blacklist)", value: "NONE" },
];

const ACTION_TYPE_OPTIONS = [
    { label: "Give Roles", value: "ADD_ROLES" },
    { label: "Remove Roles", value: "REMOVE_ROLES" },
    { label: "Add Coins", value: "ADD_BALANCE" },
    { label: "Deduct Coins", value: "REMOVE_BALANCE" },
    { label: "Send Response Message", value: "RESPOND" },
    { label: "Give Items", value: "ADD_ITEMS" },
    { label: "Remove Items", value: "REMOVE_ITEMS" },
];

function parseReqType(val: string | null | undefined): ItemRequirement["type"] {
    if (val === "TOTAL_BALANCE" || val === "ITEM") return val;
    return "ROLE";
}

function parseMatchType(val: string | null | undefined): "EVERY" | "AT_LEAST_ONE" | "NONE" {
    if (val === "AT_LEAST_ONE" || val === "NONE") return val;
    return "EVERY";
}

function parseActionType(val: string | null | undefined): ItemAction["type"] {
    if (
        val === "RESPOND" ||
        val === "REMOVE_ROLES" ||
        val === "ADD_BALANCE" ||
        val === "REMOVE_BALANCE" ||
        val === "ADD_ITEMS" ||
        val === "REMOVE_ITEMS"
    ) {
        return val;
    }
    return "ADD_ROLES";
}

function getRequirementMatchType(req: ItemRequirement): string {
    if (req.type === "ROLE" || req.type === "ITEM") return req.matchType;
    return "EVERY";
}

interface QuantitiesEditorProps {
    quantities: Record<string, number>;
    allItems: EconomyItem[];
    currentItemId: string | undefined;
    onChange: (next: Record<string, number>) => void;
}

function QuantitiesEditor({
    quantities,
    allItems,
    currentItemId,
    onChange
}: QuantitiesEditorProps): JSX.Element {
    const entries = Object.entries(quantities);
    const availableOptions = allItems
        .filter(
            (item): item is EconomyItem & { id: string } =>
                item.id !== undefined && item.id !== "" && item.id !== currentItemId,
        )
        .map((item) => ({
            value: item.id,
            label: `${item.emoji ?? ""} ${item.name}`.trim(),
        }));

    // Include unknown ids already in quantities so they remain visible
    for (const [id] of entries) {
        if (!availableOptions.some((opt) => opt.value === id)) {
            const existing = allItems.find((it) => it.id === id);
            if (existing === undefined) {
                availableOptions.push({ value: id, label: `Unknown item (${id.slice(0, 8)})` });
            }
        }
    }

    const addEntry = (): void => {
        const unused = availableOptions.find((opt) => !(opt.value in quantities));
        if (unused === undefined) return;
        const next: Record<string, number> = { ...quantities, [unused.value]: 1 };
        onChange(next);
    };

    const updateQuantity = (id: string, qty: number | undefined): void => {
        const safeQty = qty === undefined || qty < 1 ? 1 : Math.floor(qty);
        const next: Record<string, number> = { ...quantities, [id]: safeQty };
        onChange(next);
    };

    const updateItemId = (oldId: string, newId: string | null): void => {
        if (newId === null || newId === "" || newId === oldId) return;
        if (newId in quantities) return;
        const qty = quantities[oldId];
        if (typeof qty !== "number") return;
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(quantities)) {
            if (k === oldId) {
                next[newId] = v;
            } else {
                next[k] = v;
            }
        }
        onChange(next);
    };

    const removeEntry = (id: string): void => {
        const next: Record<string, number> = {};
        for (const [k, v] of Object.entries(quantities)) {
            if (k !== id) next[k] = v;
        }
        onChange(next);
    };

    return (
        <div className="space-y-2">
            {entries.length === 0 ? (
                <p className="text-xs text-muted-foreground">No items selected. Add an item to
                    require it.</p>
            ) : (
                <div className="space-y-2">
                    {entries.map(([itemId, qty]) => (
                        <div key={itemId} className="flex items-center gap-2">
                            <div className="flex-1">
                                <Dropdown
                                    options={availableOptions}
                                    value={itemId}
                                    placeholder="Select item..."
                                    onChange={(val) => {
                                        updateItemId(itemId, val);
                                    }}
                                />
                            </div>
                            <div className="w-28">
                                <NumberInput
                                    value={qty}
                                    placeholder="Qty"
                                    onChange={(val) => {
                                        updateQuantity(itemId, val);
                                    }}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    removeEntry(itemId);
                                }}
                                className="text-xs text-muted-foreground hover:text-danger px-2"
                            >
                                ✕
                            </button>
                        </div>
                    ))}
                </div>
            )}
            <Button
                type="button"
                variant="secondary"
                disabled={availableOptions.length === 0 || availableOptions.every((opt) => opt.value in quantities)}
                onClick={addEntry}
            >
                + Add Item
            </Button>
        </div>
    );
}

export function EconomyItemConfig({
    config,
    allItems,
    categories,
    isPending,
    currencyName,
    roleMap,
    guildId,
    onDelete,
    onChange,
    onSaveCategory,
}: ItemConfigProps): JSX.Element {
    const router = useRouter();
    const [isDeleting, setIsDeleting] = useState(false);
    const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);

    const isIdInvalid = config.id === undefined || config.id === "";

    const roleOptions = Object.entries(roleMap).map(([id, name]) => ({
        value: id,
        label: `@${name}`,
    }));

    const handleDelete = (id: string): void => {
        setIsDeleting(true);
        onDelete(id)
            .then(() => {
                router.push(`/dashboard/${guildId}/economy?tab=items`);
            })
            .catch(() => {
                alert("Failed to delete item.");
                setIsDeleting(false);
            });
    };

    const handleAddRequirement = (): void => {
        const newReq: ItemRequirement = {
            type: "ROLE",
            matchType: "EVERY",
            triggerFlags: 1,
            roleIds: [],
        };
        onChange({
            ...config,
            requirements: [...config.requirements, newReq],
        });
    };

    const handleUpdateRequirement = (index: number, updated: ItemRequirement): void => {
        const next = [...config.requirements];
        next[index] = updated;
        onChange({ ...config, requirements: next });
    };

    const handleRemoveRequirement = (index: number): void => {
        const next = config.requirements.filter((_, i) => i !== index);
        onChange({ ...config, requirements: next });
    };

    const handleAddAction = (): void => {
        const newAction: ItemAction = {
            type: "ADD_ROLES",
            triggerFlags: 1,
            roleIds: [],
        };
        onChange({
            ...config,
            actions: [...config.actions, newAction],
        });
    };

    const handleUpdateAction = (index: number, updated: ItemAction): void => {
        const next = [...config.actions];
        next[index] = updated;
        onChange({ ...config, actions: next });
    };

    const handleRemoveAction = (index: number): void => {
        const next = config.actions.filter((_, i) => i !== index);
        onChange({ ...config, actions: next });
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div
                className="flex items-center justify-between flex-wrap gap-2 pb-4 border-b border-border-subtle">
                <div className="flex items-center gap-2">
                    <span className="text-2xl">{config.emoji}</span>
                    <p className="font-semibold text-lg text-foreground">
                        Configure {config.name}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="danger"
                        type="button"
                        disabled={isPending || isDeleting || isIdInvalid}
                        onClick={() => {
                            if (config.id !== undefined && config.id !== "") handleDelete(config.id);
                        }}
                    >
                        {isDeleting ? "Deleting..." : "Delete Item"}
                    </Button>
                </div>
            </div>

            {/* Core Settings */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2 md:col-span-1">
                    <InputLabel>Emoji / Icon</InputLabel>
                    <TextInput
                        placeholder="🍕 or <:custom:id>"
                        value={config.emoji ?? ""}
                        onChange={(e) => {
                            onChange({ ...config, emoji: e.target.value });
                        }}
                    />
                </div>

                <div className="space-y-2 md:col-span-3">
                    <InputLabel required>Item Name</InputLabel>
                    <TextInput
                        placeholder="e.g. VIP Pass"
                        value={config.name}
                        onChange={(e) => {
                            onChange({ ...config, name: e.target.value });
                        }}
                    />
                </div>
            </div>

            {/* Price & Stock */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <InputLabel required>Price ({currencyName})</InputLabel>
                    <NumberInput
                        placeholder="0"
                        value={config.price}
                        onChange={(val) => {
                            onChange({ ...config, price: val ?? 0 });
                        }}
                    />
                </div>

                <div className="space-y-2">
                    <InputLabel>Stock Remaining</InputLabel>
                    <NumberInput
                        placeholder={config.unlimitedStock ? "Unlimited" : "0"}
                        value={config.unlimitedStock ? undefined : config.stockRemaining}
                        disabled={config.unlimitedStock}
                        onChange={(val) => {
                            onChange({ ...config, stockRemaining: val ?? 0 });
                        }}
                    />
                </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
                <InputLabel>Description</InputLabel>
                <TextInput
                    placeholder="Briefly describe what this item is or does..."
                    value={config.description}
                    onChange={(e) => {
                        onChange({ ...config, description: e.target.value });
                    }}
                />
            </div>

            {/* Category */}
            <div className="space-y-2">
                <InputLabel>Category</InputLabel>
                {(() => {
                    const ADD_NEW = "__ADD_NEW__";
                    const categoryOptions: { value: string; label: string }[] = [
                        ...categories
                            .filter((cat): cat is EconomyCategory & { id: string } => typeof cat.id === "string" && cat.id !== "")
                            .map((cat) => ({
                                value: cat.id,
                                label: `${cat.emoji ?? ""} ${cat.name}`.trim(),
                            })),
                        { value: ADD_NEW, label: "+ Add Category" },
                    ];
                    const selectedValue = config.category ?? null;
                    // Ensure selected value is either a known id or null; if stale id, still show it
                    const hasSelected = selectedValue !== null && categories.some((c) => c.id === selectedValue);
                    // If selectedValue is stale (category deleted), keep it as option so it doesn't disappear
                    const effectiveOptions = hasSelected || selectedValue === null ? categoryOptions : [...categoryOptions.slice(0, -1), { value: selectedValue, label: `Unknown (${selectedValue.slice(0, 8)})` }, categoryOptions[categoryOptions.length - 1]];

                    return (
                        <Dropdown
                            options={effectiveOptions}
                            value={selectedValue}
                            placeholder="No category"
                            allowClear={true}
                            onChange={(val) => {
                                if (val === ADD_NEW) {
                                    setIsCategoryModalOpen(true);
                                    return;
                                }
                                // val === null means cleared
                                onChange({ ...config, category: val });
                            }}
                        />
                    );
                })()}
                <p className="text-xs text-muted-foreground">Group items in the store. Create a new category from the dropdown.</p>
            </div>

            {/* Item Flags */}
            <div className="pt-4 border-t border-border-subtle space-y-3">
                <InputLabel>Item Behavior & Flags</InputLabel>
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2">
                    <ToggleSwitch
                        checked={config.unlimitedStock}
                        onChange={(checked) => {
                            onChange({ ...config, unlimitedStock: checked });
                        }}
                        text="Unlimited Stock"
                    />
                    <ToggleSwitch
                        checked={config.isListed}
                        onChange={(checked) => {
                            onChange({ ...config, isListed: checked });
                        }}
                        text="Listed in Store"
                    />
                    <ToggleSwitch
                        checked={config.isInventory}
                        onChange={(checked) => {
                            onChange({ ...config, isInventory: checked });
                        }}
                        text="Keep in Inventory on Buy"
                    />
                    <ToggleSwitch
                        checked={config.isUsable}
                        disabled={!config.isInventory}
                        onChange={(checked) => {
                            onChange({ ...config, isUsable: checked });
                        }}
                        text="Usable (/use)"
                    />
                    <ToggleSwitch
                        checked={config.isSellable}
                        disabled={!config.isInventory}
                        onChange={(checked) => {
                            onChange({ ...config, isSellable: checked });
                        }}
                        text="Sellable Back to Shop"
                    />
                </div>
            </div>

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

                {config.requirements.length === 0 ? (
                    <div
                        className="p-4 border border-dashed border-border-subtle rounded-lg text-center text-xs text-muted-foreground">
                        No requirements set. Anyone can buy and use this item.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {config.requirements.map((req, idx) => (
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
                                            currentItemId={config.id}
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

            {/* Actions Section */}
            <div className="pt-6 border-t border-border-subtle space-y-4">
                <div className="flex items-center justify-between">
                    <div>
                        <InputLabel className="mb-0">Actions (Event Side-Effects)</InputLabel>
                        <p className="text-xs text-muted-foreground">
                            Execute rewards, role changes, or messages when this item is bought or
                            used.
                        </p>
                    </div>
                    <Button onClick={handleAddAction}>+ Add Action</Button>
                </div>

                {config.actions.length === 0 ? (
                    <div
                        className="p-4 border border-dashed border-border-subtle rounded-lg text-center text-xs text-muted-foreground">
                        No actions configured. The item will act as a standard collectible.
                    </div>
                ) : (
                    <div className="space-y-3">
                        {config.actions.map((act, idx) => (
                            <div
                                key={idx}
                                className="p-3.5 rounded-lg border border-border bg-surface-active/20 space-y-3"
                            >
                                <div
                                    className="flex items-center justify-between gap-2 border-b border-border-subtle pb-2">
                                    <span className="text-xs font-semibold text-foreground">
                                        Action #{idx + 1}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            handleRemoveAction(idx);
                                        }}
                                        className="text-xs text-muted-foreground hover:text-danger transition cursor-pointer"
                                    >
                                        ✕ Remove
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <div>
                                        <InputLabel>Trigger</InputLabel>
                                        <Dropdown
                                            options={TRIGGER_OPTIONS}
                                            value={String(act.triggerFlags)}
                                            onChange={(val) => {
                                                const nextFlags = Number(val ?? "1");
                                                const updated: ItemAction = {
                                                    ...act,
                                                    triggerFlags: nextFlags
                                                };
                                                handleUpdateAction(idx, updated);
                                            }}
                                        />
                                    </div>
                                    <div>
                                        <InputLabel>Action Type</InputLabel>
                                        <Dropdown
                                            options={ACTION_TYPE_OPTIONS}
                                            value={act.type}
                                            onChange={(val) => {
                                                const newType = parseActionType(val);
                                                if (newType === "RESPOND") {
                                                    handleUpdateAction(idx, {
                                                        type: "RESPOND",
                                                        triggerFlags: act.triggerFlags,
                                                        message: DEFAULT_ITEM_MESSAGE,
                                                    });
                                                } else if (newType === "ADD_ROLES") {
                                                    handleUpdateAction(idx, {
                                                        type: "ADD_ROLES",
                                                        triggerFlags: act.triggerFlags,
                                                        roleIds: [],
                                                    });
                                                } else if (newType === "REMOVE_ROLES") {
                                                    handleUpdateAction(idx, {
                                                        type: "REMOVE_ROLES",
                                                        triggerFlags: act.triggerFlags,
                                                        roleIds: [],
                                                    });
                                                } else if (newType === "ADD_BALANCE") {
                                                    handleUpdateAction(idx, {
                                                        type: "ADD_BALANCE",
                                                        triggerFlags: act.triggerFlags,
                                                        balance: 0,
                                                    });
                                                } else if (newType === "REMOVE_BALANCE") {
                                                    handleUpdateAction(idx, {
                                                        type: "REMOVE_BALANCE",
                                                        triggerFlags: act.triggerFlags,
                                                        balance: 0,
                                                    });
                                                } else if (newType === "ADD_ITEMS") {
                                                    handleUpdateAction(idx, {
                                                        type: "ADD_ITEMS",
                                                        triggerFlags: act.triggerFlags,
                                                        quantities: {},
                                                        itemIds: [],
                                                    });
                                                } else {
                                                    handleUpdateAction(idx, {
                                                        type: "REMOVE_ITEMS",
                                                        triggerFlags: act.triggerFlags,
                                                        quantities: {},
                                                        itemIds: [],
                                                    });
                                                }
                                            }}
                                        />
                                    </div>
                                </div>

                                {(act.type === "ADD_ROLES" || act.type === "REMOVE_ROLES") && (
                                    <div className="space-y-1">
                                        <InputLabel>
                                            {act.type === "ADD_ROLES" ? "Roles to Grant" : "Roles to Strip"}
                                        </InputLabel>
                                        <Dropdown
                                            multiple={true}
                                            options={roleOptions}
                                            value={act.roleIds}
                                            placeholder="Select roles..."
                                            onChange={(selectedRoleIds) => {
                                                handleUpdateAction(idx, {
                                                    ...act,
                                                    roleIds: selectedRoleIds,
                                                });
                                            }}
                                        />
                                    </div>
                                )}

                                {(act.type === "ADD_BALANCE" || act.type === "REMOVE_BALANCE") && (
                                    <div className="space-y-1">
                                        <InputLabel>Coin Amount ({currencyName})</InputLabel>
                                        <NumberInput
                                            value={act.balance}
                                            placeholder="1000"
                                            onChange={(val) => {
                                                handleUpdateAction(idx, {
                                                    ...act,
                                                    balance: val ?? 0,
                                                });
                                            }}
                                        />
                                    </div>
                                )}

                                {(act.type === "ADD_ITEMS" || act.type === "REMOVE_ITEMS") && (
                                    <div className="space-y-1">
                                        <InputLabel>{act.type === "ADD_ITEMS" ? "Items to Give" : "Items to Remove"}</InputLabel>
                                        <QuantitiesEditor
                                            quantities={act.quantities}
                                            allItems={allItems}
                                            currentItemId={config.id}
                                            onChange={(nextQuantities) => {
                                                handleUpdateAction(idx, {
                                                    ...act,
                                                    quantities: nextQuantities
                                                });
                                            }}
                                        />
                                    </div>
                                )}

                                {act.type === "RESPOND" && (
                                    <div className="space-y-1">
                                        <InputLabel>Response Message</InputLabel>
                                        <TextInput
                                            value={act.message.content}
                                            placeholder="You used this item and received a blessing!"
                                            onChange={(e) => {
                                                handleUpdateAction(idx, {
                                                    ...act,
                                                    message: {
                                                        format: "TEXT",
                                                        content: e.target.value,
                                                        embed: {},
                                                    },
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

            <EconomyCategoryCreateModal
                isOpen={isCategoryModalOpen}
                onClose={() => { setIsCategoryModalOpen(false)} }
                onSave={async (cat) => {
                    const created = await onSaveCategory(cat);
                    onChange({ ...config, category: created.id ?? null });
                    return created;
                }}
            />
        </div>
    );
}
