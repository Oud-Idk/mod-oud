"use client";

import React, { useState } from "react";
import { TextInput } from "@/components/Inputs/TextInput";
import PrimaryButton from "@/components/Inputs/Buttons/PrimaryButton";

interface CustomCommandCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (val: { name: string; description: string }) => Promise<void>;
}

export function CustomCommandCreateModal({ isOpen, onClose, onSave }: CustomCommandCreateModalProps) {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    const handleCreate = async () => {
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-neutral-900 border border-neutral-800 w-full max-w-md rounded-lg p-6 space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-neutral-800">
                    <h3 className="font-semibold text-lg">Create Custom Command</h3>
                    <button onClick={onClose} className="text-neutral-400 hover:text-white cursor-pointer text-sm">
                        ✕
                    </button>
                </div>

                <div className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Command Name / Trigger</label>
                        <TextInput
                            disableSubmitButton
                            placeholder="e.g. rules or info"
                            value={name}
                            onChange={(e) => setName(e.target.value.replace(/\s+/g, ""))}
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-sm font-medium">Description (Optional)</label>
                        <TextInput
                            disableSubmitButton
                            placeholder="e.g. Displays server information"
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                        />
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm rounded bg-neutral-800 hover:bg-neutral-700 cursor-pointer"
                        >
                            Cancel
                        </button>
                        <PrimaryButton onClick={handleCreate} disabled={isSaving || !name.trim()}>
                            {isSaving ? "Creating..." : "Create Command"}
                        </PrimaryButton>
                    </div>
                </div>
            </div>
        </div>
    );
}