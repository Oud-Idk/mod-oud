"use client";

import React, { useState } from "react";
import { Modal } from "@/components/Modal";
import SecondaryButton from "@/components/Inputs/Buttons/SecondaryButton";
import PrimaryButton from "@/components/Inputs/Buttons/PrimaryButton";
import { TextInput } from "@/components/Inputs/TextInput";
import { InputLabel } from "@/components/Layout/InputLabel";
import { BadWordRuleset } from "@/types/db";

type SaveableBadWordRuleset = Omit<BadWordRuleset, "createdAt" | "updatedAt" | "guildId" | "id"> & {
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
        if (!trimmed) return;

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
            setName("");
            onClose();
        } catch (err) {
            console.error("Error creating ruleset:", err);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <Modal onClose={onClose} headerText="Create Bad Words Ruleset">
            <div>
                <InputLabel>
                    Ruleset Name</InputLabel>
                <TextInput
                    placeholder="e.g. Hate Speech, Spam Keywords..."
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disableSubmitButton
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