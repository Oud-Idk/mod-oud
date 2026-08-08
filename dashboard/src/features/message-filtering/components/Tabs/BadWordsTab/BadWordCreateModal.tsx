"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import SecondaryButton from "@/components/ui/buttons/SecondaryButton";
import PrimaryButton from "@/components/ui/buttons/PrimaryButton";
import { TextInput } from "@/components/ui/TextInput";
import { InputLabel } from "@/components/layout/InputLabel";
import { toast } from "sonner";

import { BadWordRuleset } from "@/features/message-filtering/types";

type SaveableBadWordRuleset = Omit<BadWordRuleset, "created_at" | "updated_at" | "guild_id" | "id"> & {
    id?: string;
};

interface BadWordCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (ruleset: SaveableBadWordRuleset) => Promise<any>;
}

export function BadWordCreateModal({ isOpen, onClose, onSave }: BadWordCreateModalProps) {
    const [name, setName] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.SyntheticEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) {
            toast.error("Ruleset name is required");
            return;
        }

        setIsSaving(true);
        try {
            await onSave({
                name: trimmed,
                enabled: true,
                patterns: [],
                actions: ["DELETE"],
                timeoutDurationSeconds: null,
                scope: { mode: "EXEMPT", roles: [], channels: [] },
            });
            toast.success("Ruleset created successfully");
            setName("");
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to create ruleset");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal onClose={onClose} headerText="Create Bad Words Ruleset">
            <div>
                <InputLabel>Ruleset Name</InputLabel>
                <TextInput
                    placeholder="e.g. Hate Speech, Spam Keywords..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="min-w-full"
                />
            </div>

            <div className="flex justify-end gap-3 pt-2">
                <SecondaryButton onClick={onClose} disabled={isSaving}>Cancel</SecondaryButton>
                <PrimaryButton disabled={isSaving || !name.trim()} onClick={handleSubmit}>
                    {isSaving ? "Creating..." : "Create"}
                </PrimaryButton>
            </div>
        </Modal>
    );
}