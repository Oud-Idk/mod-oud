"use client";

import React, { useState, useEffect, useTransition, JSX } from "react";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";
import { useRouter, useSearchParams } from "next/navigation";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { EconomyItem, economyItemSchema } from "@/features/economy/types";
import { isDeepEqual } from "@/features/_shared/embed";
import { cn } from "@/lib/cn";
import { toast } from "sonner";
import { Button } from "@/components/ui/inputs/Button";
import { EconomyItemConfig } from "@/features/economy/components/tabs/economy-items/EconomyItemConfig";
import { EconomyItemCreateModal } from "@/features/economy/components/tabs/economy-items/EconomyItemCreateModal";

interface EconomyItemsBodyProps {
    items: EconomyItem[];
    activeConfig?: EconomyItem | null;
    onSave: (item: EconomyItem) => Promise<EconomyItem>;
    onDelete: (id: string) => Promise<boolean>;
    currencyName: string;
    guildId: string;
    roleMap: Record<string, string>;
}

export function EconomyItemsTab({
    items,
    activeConfig,
    onSave,
    onDelete,
    currencyName,
    guildId,
    roleMap,
}: EconomyItemsBodyProps): JSX.Element {
    const router = useRouter();
    const searchParams = useSearchParams();
    const selectedId = searchParams.get("id");

    const [config, setConfig] = useState<EconomyItem | null>(() => {
        if (selectedId !== null && selectedId !== "") {
            return items.find((i) => i.id === selectedId) ?? activeConfig ?? null;
        }
        return activeConfig ?? null;
    });

    const [isPending, startTransition] = useTransition();
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    // Sync active config whenever the ?id= URL param changes or items update
    useEffect(() => {
        if (selectedId !== null && selectedId !== "") {
            const found = items.find((i) => i.id === selectedId);
            if (found !== undefined) {
                setConfig(found);
                return;
            }
        }
        setConfig(activeConfig ?? null);
    }, [selectedId, items, activeConfig]);

    // Find the saved baseline to calculate isDirty
    const currentSavedItem = items.find((i) => i.id === config?.id) ?? null;
    const isDirty = !isDeepEqual(config, currentSavedItem);

    const handleSave = (): void => {
        if (!config) return;

        const result = economyItemSchema.safeParse(config);
        if (!result.success) {
            const firstMessage = result.error.issues[0].message;
            toast.error(firstMessage);
            return;
        }

        startTransition(async () => {
            try {
                const saved = await onSave(result.data);
                setConfig(saved);
                toast.success("Item saved successfully");
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to save item.");
            }
        });
    };

    const handleCancel = (): void => {
        setConfig(currentSavedItem);
    };

    return (
        <div>
            <ConfigListLayout<EconomyItem>
                title="Store Items"
                createButtonText="+ New Item"
                onCreateClick={() => { setIsCreateModalOpen(true); }}
                items={items}
                renderItem={(item) => {
                    const isCurrent = selectedId === item.id || config?.id === item.id;
                    return (
                        <button
                            key={item.id ?? item.name}
                            type="button"
                            onClick={() => {
                                if (item.id !== undefined) {
                                    router.push(`/dashboard/${guildId}/economy?tab=items&id=${item.id}`);
                                }
                            }}
                            className={cn(
                                "w-full flex items-center justify-between text-left p-3 rounded-md transition-all cursor-pointer border focus-ring",
                                isCurrent
                                    ? "bg-surface-active/50 border-border text-foreground shadow-sm font-medium"
                                    : "border-transparent hover:bg-surface-active/60 text-foreground"
                            )}
                        >
                            <div className="flex items-center gap-2 truncate">
                                <span>{item.emoji}</span>
                                <span className="truncate">{item.name}</span>
                            </div>
                            <span className="text-xs text-muted-foreground shrink-0 font-normal">
                                {item.price} {currencyName}
                            </span>
                        </button>
                    );
                }}
                hasActiveConfig={config !== null}
                handleSave={handleSave}
                handleCancel={handleCancel}
                noActivePlaceholder={
                    <div className="max-w-md mx-auto space-y-4 flex items-center flex-col text-center">
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-foreground">
                                Store Items
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Create items that users can purchase, collect in their inventory, or use to trigger custom actions.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={() => { setIsCreateModalOpen(true); }}>
                                Create Your First Item
                            </Button>
                        </div>
                    </div>
                }
            >
                {config && (
                    <EconomyItemConfig
                        key={config.id}
                        config={config}
                        allItems={items}
                        isPending={isPending}
                        currencyName={currencyName}
                        guildId={guildId}
                        onDelete={onDelete}
                        onChange={setConfig}
                        roleMap={roleMap}
                    />
                )}
            </ConfigListLayout>

            <EconomyItemCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => { setIsCreateModalOpen(false); }}
                onSave={onSave}
                guildId={guildId}
                currencyName={currencyName}
            />

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={handleSave}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}