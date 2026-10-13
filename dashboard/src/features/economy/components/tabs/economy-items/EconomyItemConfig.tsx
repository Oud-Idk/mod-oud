"use client";

import { JSX, useState } from "react";
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
} from "@/features/economy/types";
import { EconomyCategoryCreateModal } from "./EconomyCategoryCreateModal";
import { ItemRequirementsSection } from "./ItemRequirementsSection";
import { ItemActionsSection } from "./ItemActionsSection";

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
                                label: cat.name.trim(),
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

            <ItemRequirementsSection
                requirements={config.requirements}
                roleOptions={roleOptions}
                allItems={allItems}
                currentItemId={config.id}
                currencyName={currencyName}
                onChange={(requirements) => { onChange({ ...config, requirements }); }}
            />

            <ItemActionsSection
                actions={config.actions}
                roleOptions={roleOptions}
                allItems={allItems}
                currentItemId={config.id}
                currencyName={currencyName}
                onChange={(actions) => { onChange({ ...config, actions }); }}
            />

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