"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { LongTextInput } from "@/components/ui/LongTextInput";

interface WarnModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (reason: string) => Promise<void>;
    isSubmitting: boolean;
}

export function WarnModal({ isOpen, onClose, onSubmit, isSubmitting }: WarnModalProps) {
    const [reason, setReason] = useState<string>("");

    if (!isOpen) return null;

    const handleSubmit = (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();
        onSubmit(reason);
    };

    return (
        <Modal headerText="Warn User" onClose={onClose}>
            <div className="space-y-1">
                <label>Reason</label>
                <LongTextInput
                    onChange={r => setReason(r.target.value)}
                    placeholder="Provide a reason for the warning..."
                    value={reason}
                />
            </div>

            <div className="flex gap-2 justify-end pt-2">
                <button
                    type="button"
                    onClick={onClose}
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded text-sm font-semibold border border-neutral-300 dark:border-neutral-700 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition disabled:opacity-50 cursor-pointer text-neutral-800 dark:text-neutral-200"
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="px-4 py-2 rounded text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-50 cursor-pointer"
                >
                    {isSubmitting ? "Applying..." : "Confirm Warning"}
                </button>
            </div>
        </Modal>
    );
}