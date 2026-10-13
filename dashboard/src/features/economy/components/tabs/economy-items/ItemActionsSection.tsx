"use client";

import { JSX } from "react";
import { Button } from "@/components/ui/inputs/Button";
import { InputLabel } from "@/components/layout/InputLabel";
import { Dropdown } from "@/components/ui/inputs/Dropdown";
import { NumberInput } from "@/components/ui/inputs/NumberInput";
import { TextInput } from "@/components/ui/inputs/TextInput";
import { DEFAULT_ITEM_MESSAGE, EconomyItem, ItemAction } from "@/features/economy/types";
import { QuantitiesEditor } from "./QuantitiesEditor";
import { TRIGGER_OPTIONS, ACTION_TYPE_OPTIONS, parseActionType } from "./itemFormOptions";

interface ItemActionsSectionProps {
    actions: ItemAction[];
    roleOptions: { value: string; label: string }[];
    allItems: EconomyItem[];
    currentItemId: string | undefined;
    currencyName: string;
    onChange: (actions: ItemAction[]) => void;
}

export function ItemActionsSection({
    actions,
    roleOptions,
    allItems,
    currentItemId,
    currencyName,
    onChange,
}: ItemActionsSectionProps): JSX.Element {
    const handleAddAction = (): void => {
        const newAction: ItemAction = {
            type: "ADD_ROLES",
            triggerFlags: 1,
            roleIds: [],
        };
        onChange([...actions, newAction]);
    };

    const handleUpdateAction = (index: number, updated: ItemAction): void => {
        const next = [...actions];
        next[index] = updated;
        onChange(next);
    };

    const handleRemoveAction = (index: number): void => {
        onChange(actions.filter((_, i) => i !== index));
    };

    return (
        <>
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

            {actions.length === 0 ? (
                <div
                    className="p-4 border border-dashed border-border-subtle rounded-lg text-center text-xs text-muted-foreground">
                    No actions configured. The item will act as a standard collectible.
                </div>
            ) : (
                <div className="space-y-3">
                    {actions.map((act, idx) => (
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
                                        currentItemId={currentItemId}
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

        </>
    );
}
