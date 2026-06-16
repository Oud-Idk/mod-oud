"use client";

import React, { useState } from "react";

interface TimeoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (durationMins: number, reason: string) => Promise<void>;
    isSubmitting: boolean;
}

export function TimeoutModal({ isOpen, onClose, onSubmit, isSubmitting }: TimeoutModalProps) {
    const [duration, setDuration] = useState<number>(10);
    const [unit, setUnit] = useState<"minutes" | "hours" | "days">("minutes");
    const [reason, setReason] = useState<string>("");

    if (!isOpen) return null;

    const handleSubmit = (e: React.SubmitEvent) => {
        e.preventDefault();

        let factor = 1;
        if (unit === "hours") factor = 60;
        if (unit === "days") factor = 1440;

        const durationMins = duration * factor;
        onSubmit(durationMins, reason);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-zinc-900 border border-neutral-300 dark:border-neutral-800 rounded-xl max-w-md w-full overflow-hidden shadow-xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-neutral-900 dark:text-neutral-100">Timeout User</h3>
                    <button
                        onClick={onClose}
                        className="text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 cursor-pointer text-sm"
                    >
                        ✕
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Duration</label>
                        <div className="flex gap-2">
                            <input
                                type="number"
                                min={1}
                                required
                                value={duration}
                                onChange={(e) => setDuration(parseInt(e.target.value) || 1)}
                                className="flex-1 bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-3 py-1.5 text-sm outline-none focus:border-purple-500"
                            />
                            <select
                                value={unit}
                                onChange={(e) => setUnit(e.target.value as any)}
                                className="bg-neutral-100 dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-700 rounded px-2 py-1.5 text-sm outline-none cursor-pointer"
                            >
                                <option value="minutes">Minutes</option>
                                <option value="hours">Hours</option>
                                <option value="days">Days</option>
                            </select>
                        </div>
                    </div>

                    <div className="space-y-1">
                        <label className="text-xs font-semibold text-zinc-400 uppercase tracking-wider block">Reason</label>
                        <textarea
                            placeholder="Provide a reason for the audit log..."
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={3}
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
                            className="px-4 py-2 rounded text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white transition disabled:opacity-50 cursor-pointer"
                        >
                            {isSubmitting ? "Applying..." : "Confirm Timeout"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}