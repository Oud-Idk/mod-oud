"use client";

import { JSX } from "react";
import { Button } from "@/components/ui/inputs/Button";
import { Dropdown } from "@/components/ui/inputs/Dropdown";
import { NumberInput } from "@/components/ui/inputs/NumberInput";
import { EconomyItem } from "@/features/economy/types";

interface QuantitiesEditorProps {
    quantities: Record<string, number>;
    allItems: EconomyItem[];
    currentItemId: string | undefined;
    onChange: (next: Record<string, number>) => void;
}

export function QuantitiesEditor({
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
                disabled={availableOptions.every((opt) => opt.value in quantities)}
                onClick={addEntry}
            >
                + Add Item
            </Button>
        </div>
    );
}
