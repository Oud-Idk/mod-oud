"use client";

import React, { useState } from "react";

interface WarnModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (reason: string) => Promise<void>;
    isSubmitting: boolean;
}

export function WarnModal({ isOpen, onClose, onSubmit, isSubmitting }: WarnModalProps) {
    const [reason, setReason] = useState<string>("");

    if (!isOpen) return null;

    const handleSubmit = (e: React.SubmitEvent) => {
        e.preventDefault();
        onSubmit(reason);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-zinc-900 border border-neutral-300 dark:border-neutral-800 rounded-xl max-w-md w-full overflow-hidden shadow-xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">Warn User</h3>
                    <button
                        onClick={onClose}
                        className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer text-sm"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Reason</label>
                        <textarea
                            placeholder="Provide a reason for the warning..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
                            required
                            className="w-full bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-1.5 text-sm outline-none focus:border-purple-500 resize-none"
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
                            disabled={isSubmitting}
                            className="px-4 py-2 rounded text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white transition disabled:opacity-50 cursor-pointer"
                        >
                            {isSubmitting ? "Applying..." : "Confirm Warning"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}