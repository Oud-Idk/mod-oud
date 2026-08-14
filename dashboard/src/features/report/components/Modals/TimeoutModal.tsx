"use client";

import React, { JSX, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { LongTextInput } from "@/components/ui/LongTextInput";
import { NumberInput } from "@/components/ui/NumberInput";
import { Dropdown } from "@/components/ui/Dropdown";
import { TimeUnit } from "@/features/report/types";

interface TimeoutModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (durationMins: number, reason: string) => Promise<void>;
    isSubmitting: boolean;
}

export function TimeoutModal({ isOpen, onClose, onSubmit, isSubmitting }: TimeoutModalProps): JSX.Element | null {
    const [duration, setDuration] = useState<number | undefined>(10);
    const [unit, setUnit] = useState<TimeUnit>("MINUTES");
    const [reason, setReason] = useState<string>("");

    if (!isOpen) return null;

    const handleSubmit = (e: React.SubmitEvent): void => {
        e.preventDefault();

        let factor = 1;
        if (unit === "HOURS") factor = 60;
        if (unit === "DAYS") factor = 1440;

        const durationMins = (duration ?? 0) * factor;
        onSubmit(durationMins, reason);
    };

    return (
        <Modal headerText="Timeout User" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-2">
                <div className="space-y-1">
                    <label>Reason</label>
                    <LongTextInput
                        onChange={r =>{  setReason(r.target.value); }}
                        placeholder="Provide a reason for the timeout"
                        value={reason}
                    />
                </div>
                <div className="space-y-1">
                    <label>Duration</label>
                    <div className="flex gap-2">
                        <NumberInput
                            value={duration} onChange={v =>{  setDuration(v); }} min={1} className="h-10"
                        />
                        <Dropdown
                            value={unit} onChange={v =>{  setUnit(v ?? "MINUTES"); }} options={[
                            { value: "MINUTES", label: "Minutes" },
                            { value: "HOURS", label: "Hours" },
                            { value: "DAYS", label: "Days" },
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