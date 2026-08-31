"use client";

import React, { ReactNode, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { TextInput } from "@/components/ui/inputs/TextInput";
import { NumberInput } from "@/components/ui/inputs/NumberInput";
import { InputLabel } from "@/components/layout/InputLabel";
import { Button } from "@/components/ui/inputs/Button";
import { toast } from "sonner";
import { EconomyItem } from "@/features/economy/types";

interface ItemCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (item: EconomyItem) => Promise<EconomyItem>;
    currencyName: string;
    guildId: string;
}

export function EconomyItemCreateModal({
    isOpen,
    onClose,
    onSave,
    currencyName,
    guildId,
}: ItemCreateModalProps): ReactNode | null {
    const router = useRouter();

    const [isPending, startTransition] = useTransition();
    const [name, setName] = useState("");
    const [price, setPrice] = useState<number>(100);
    const [emoji, setEmoji] = useState("");

    if (!isOpen) return null;

    const handleSubmit = (e: React.SubmitEvent): void => {
        e.preventDefault();
        if (name.trim() === "") {
            toast.error("Item name is required.");
            return;
        }

        startTransition(async () => {
            try {
                const newItem: EconomyItem = {
                    name,
                    price: price,
                    emoji: emoji.trim() === "" ? undefined : emoji.trim(),
                    description: "",
                    category: null,
                    unlimitedStock: true,
                    stockRemaining: 0,
                    isListed: true,
                    isInventory: true,
                    isUsable: true,
                    isSellable: true,
                    requirements: [],
                    actions: [],
                };

                const created = await onSave(newItem);
                toast.success("Item created successfully");
                onClose();

                if (created.id !== undefined) {
                    router.push(`/dashboard/${guildId}/economy?tab=items&id=${created.id}`);
                } else {
                    router.push(`/dashboard/${guildId}/economy?tab=items`);
                }
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to create item.");
            }
        });
    };

    return (
        <Modal headerText="Create Store Item" onClose={onClose}>
            <p className="-mt-2 mb-4 text-xs text-muted-foreground">
                Set basic initial info. You can configure requirements, actions, and stock limits right after.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-4 gap-3">
                    <div className="col-span-1 space-y-2">
                        <InputLabel>Emoji</InputLabel>
                        <TextInput
                            value={emoji}
                            onChange={(e) => { setEmoji(e.target.value); }}
                            placeholder="🍕"
                            className="placeholder:text-foreground/25"
                        />
                    </div>
                    <div className="col-span-3 space-y-2">
                        <InputLabel required>Item Name</InputLabel>
                        <TextInput
                            value={name}
                            onChange={(e) => { setName(e.target.value); }}
                            placeholder="e.g. Fishing Rod"
                            autoFocus
                        />
                    </div>
                </div>

                <div className="space-y-2">
                    <InputLabel required>Price ({currencyName})</InputLabel>
                    <NumberInput
                        value={price}
                        onChange={(val) => { setPrice(val ?? 0); }}
                        placeholder="100"
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-border-subtle">
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button disabled={isPending} type="submit">
                        {isPending ? "Creating..." : "Create Item"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}