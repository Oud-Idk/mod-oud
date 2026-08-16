"use client";

import React, { JSX, useState } from "react";
import { TextInput } from "@/components/ui/TextInput";
import { Modal } from "@/components/ui/Modal";
import { InputLabel } from "@/components/layout/InputLabel";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";

interface CustomCommandCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (val: { name: string; description: string }) => Promise<void>;
}

export function CustomCommandCreateModal({
    isOpen,
    onClose,
    onSave,
}: CustomCommandCreateModalProps): JSX.Element | null {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    const handleCreate = async (): Promise<void> => {
        if (name.trim() === "") {
            toast.error("Command name is required");
            return;
        }
        setIsSaving(true);
        try {
            await onSave({ name, description });
            toast.success("Custom command created successfully");
            setName("");
            setDescription("");
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to create command");
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
                        onChange={(e) => { setName(e.target.value.replace(/\s+/g, "")); }}
                    />
                </div>

                <div>
                    <InputLabel>
                        Description (Optional)
                    </InputLabel>
                    <TextInput
                        placeholder="e.g. Displays server information"
                        value={description}
                        onChange={(e) => { setDescription(e.target.value); }}
                    />
                </div>

                <div className="flex justify-end gap-2">
                    <Button
                        variant="secondary"
                        type="button"
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCreate}
                        disabled={isSaving || name.trim() === ""}
                    >
                        {isSaving ? "Creating..." : "Create Command"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}