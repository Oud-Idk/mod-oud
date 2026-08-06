"use client";

import React, { ReactNode, useState } from "react";
import { TextInput } from "@/components/ui/TextInput";
import { Modal } from "@/components/ui/Modal";
import PrimaryButton from "@/components/ui/buttons/PrimaryButton";
import { InputLabel } from "@/components/layout/InputLabel";

interface CustomCommandCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (val: { name: string; description: string }) => Promise<void>;
}

export function CustomCommandCreateModal({
    isOpen,
    onClose,
    onSave,
}: CustomCommandCreateModalProps): ReactNode | null {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    const handleCreate = async (): Promise<void> => {
        if (!name.trim()) return;
        setIsSaving(true);
        try {
            await onSave({ name, description });
            setName("");
            setDescription("");
        } catch (err) {
            console.error("Failed to create command:", err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal
            onClose={onClose}
            headerText="Create Custom Command"
            className="max-w-md"
        >
            <div className="space-y-2">
                <div>
                    <InputLabel>Command Name / Trigger</InputLabel>
                    <TextInput
                        placeholder="e.g. rules or info"
                        value={name}
                        onChange={(e) => setName(e.target.value.replace(/\s+/g, ""))}
                    />
                </div>

                <div>
                    <InputLabel>
                        Description (Optional)
                    </InputLabel>
                    <TextInput
                        placeholder="e.g. Displays server information"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>

                <div className="flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-semibold rounded-md bg-surface-active hover:bg-surface-muted text-foreground border border-border-subtle transition-all cursor-pointer"
                    >
                        Cancel
                    </button>
                    <PrimaryButton
                        onClick={handleCreate}
                        disabled={isSaving || !name.trim()}
                    >
                        {isSaving ? "Creating..." : "Create Command"}
                    </PrimaryButton>
                </div>
            </div>
        </Modal>
    );
}