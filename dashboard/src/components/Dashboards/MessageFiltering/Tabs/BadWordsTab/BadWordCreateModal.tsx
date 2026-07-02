"use client";

import React, { useState } from "react";
import { BadWordRulesetRow } from "@/utils/db/config";

interface BadWordCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (ruleset: Partial<BadWordRulesetRow>) => Promise<any>;
}

export function BadWordCreateModal({ isOpen, onClose, onSave }: BadWordCreateModalProps) {
    const [name, setName] = useState("");
    const [isSaving, setIsSaving] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.SubmitEvent) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (!trimmed) return;

        setIsSaving(true);
        try {
            await onSave({
                name: trimmed,
                enabled: true,
                patterns: [],
                actions: ["delete"],
                timeoutDurationSeconds: null,
                scope: { mode: "exempt", roles: [], channels: [] },
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50">
            <form
                onSubmit={handleSubmit}
                className="bg-white dark:bg-black border border-neutral-500 p-6 rounded-lg w-full max-w-md space-y-4 shadow-xl"
            >
                <h3 className="text-base font-bold">Create Bad Words Ruleset</h3>

                <div className="space-y-2">
                    <label className="block text-xs uppercase font-semibold tracking-wider">Ruleset
                        Name</label>
                    <input
                        type="text"
                        placeholder="e.g. Hate Speech, Spam Keywords..."
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full bg-neutral-300/10 border-neutral-500 border rounded p-2 text-sm focus:outline-none focus:border-neutral-500"
                        required
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSaving}
                        className="px-4 py-1.5 rounded text-sm hover:bg-neutral-300/10 transition cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSaving || !name.trim()}
                        className="px-4 py-1.5 disabled:border-0 border font-medium rounded text-sm transition disabled:opacity-50 cursor-pointer hover:bg-neutral-300/10"
                    >
                        {isSaving ? "Creating..." : "Create"}
                    </button>
                </div>
            </form>
        </div>
    );
}