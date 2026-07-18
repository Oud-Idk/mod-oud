"use client";

import React, { useState } from "react";
import { Modal } from "@/components/Modal";
import { LongTextInput } from "@/components/Inputs/LongTextInput";
import { NumberInput } from "@/components/Inputs/NumberInput";
import { Dropdown } from "@/components/Inputs/Dropdown";

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
        <Modal headerText="Timeout User" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-2">
                <div className="space-y-1">
                    <label>Reason</label>
                    <LongTextInput
                        onChange={r => setReason(r)} placeholder="Provide a reason for the timeout" value={reason}
                    />
                </div>
                <div className="space-y-1">
                    <label>Duration</label>
                    <div className="flex gap-2">
                        <NumberInput
                            value={duration} onChange={v => setDuration(v === "" ? 1 : v)} min={1} className="h-10"
                        />
                        <Dropdown
                            value={unit} onChange={v => setUnit(v as "minutes" | "hours" | "days")} options={[
                            { value: "minutes", label: "Minutes" },
                            { value: "hours", label: "Hours" },
                            { value: "days", label: "Days" },
                        ]} className="max-w-50 h-10"
                        />
                    </div>
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
        </Modal>
    );
}