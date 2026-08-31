"use client";

import React, { ReactNode, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { TextInput } from "@/components/ui/inputs/TextInput";
import { InputLabel } from "@/components/layout/InputLabel";
import { Button } from "@/components/ui/inputs/Button";
import { toast } from "sonner";
import { EconomyCategory } from "@/features/economy/types";

interface CategoryCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (category: EconomyCategory) => Promise<EconomyCategory>;
}

export function EconomyCategoryCreateModal({
    isOpen,
    onClose,
    onSave,
}: CategoryCreateModalProps): ReactNode | null {
    const [isPending, startTransition] = useTransition();
    const [name, setName] = useState("");

    if (!isOpen) return null;

    const handleSubmit = (e: React.SubmitEvent): void => {
        e.preventDefault();
        if (name.trim().length < 1 || name.trim().length > 100) {
            toast.error("Category name must be 1–100 characters.");
            return;
        }

        startTransition(async () => {
            try {
                const payload: EconomyCategory = {
                    name: name.trim(),
                    description: "",
                    position: 0,
                };
                const created = await onSave(payload);
                toast.success(`Category "${created.name}" created`);
                setName("");
                onClose();
            } catch (err) {
                toast.error(err instanceof Error ? err.message : "Failed to create category.");
            }
        });
    };

    const handleClose = (): void => {
        setName("");
        onClose();
    };

    return (
        <Modal headerText="Create Category" onClose={handleClose}>
            <p className="-mt-2 mb-4 text-xs text-muted-foreground">
                Organize your store items into categories. They will be shown in the Discord store.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                    <InputLabel required>Category Name</InputLabel>
                    <TextInput
                        value={name}
                        onChange={(e) => { setName(e.target.value); }}
                        placeholder="e.g. Weapons, Potions, Boosts"
                        autoFocus
                        maxLength={100}
                    />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-border-subtle">
                    <Button variant="secondary" type="button" onClick={handleClose} disabled={isPending}>
                        Cancel
                    </Button>
                    <Button disabled={isPending} type="submit">
                        {isPending ? "Creating..." : "Create Category"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}
