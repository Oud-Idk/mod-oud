"use client";

import React, { useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { LongTextInput } from "@/components/ui/LongTextInput";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { NumberInput } from "@/components/ui/NumberInput";
import { Dropdown } from "@/components/ui/Dropdown";
import { TimeUnit } from "@/features/report/types";

interface BanModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (durationMins: number | undefined, reason: string) => Promise<void>;
    isSubmitting: boolean;
}

export function BanModal({ isOpen, onClose, onSubmit, isSubmitting }: BanModalProps) {
    const [isTemporary, setIsTemporary] = useState<boolean>(false);
    const [duration, setDuration] = useState<number | undefined>(7);
    const [unit, setUnit] = useState<TimeUnit>("DAYS");
    const [reason, setReason] = useState<string>("");

    if (!isOpen) return null;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();

        let durationMins: number | undefined = undefined;

        if (isTemporary) {
            let factor = 1;
            if (unit === "HOURS") factor = 60;
            if (unit === "DAYS") factor = 1440;
            durationMins = (duration ?? 0) * factor;
        }

        onSubmit(durationMins, reason);
    };

    return (
        <Modal onClose={onClose} headerText="Ban User">
            <form onSubmit={handleSubmit} className="space-y-2">
                <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Reason</label>
                    <LongTextInput
                        placeholder="Provide a reason for the ban..."
                        value={reason}
                        onChange={(r) => setReason(r.target.value)}
                    />
                </div>

                <ToggleSwitch
                    checked={isTemporary}
                    onChange={setIsTemporary}
                    text="Temporary Ban"
                    className="text-base"
                />

                {isTemporary && (
                    <div className="space-y-2">
                        <label className="text-sm font-medium text-foreground">Duration</label>
                        <div className="flex gap-2">
                            <NumberInput
                                value={duration}
                                onChange={n => setDuration(n)}
                                min={1}
                                className="h-10"
                            />
                            <Dropdown
                                value={unit}
                                onChange={v => v && setUnit(v as TimeUnit)}
                                options={[
                                    { value: "MINUTES", label: "Minutes" },
                                    { value: "HOURS", label: "Hours" },
                                    { value: "DAYS", label: "Days" },
                                ]}
                                className="max-w-50 h-10"
                            />
                        </div>
                    </div>
                )}

                <div className="flex gap-2 justify-end pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded text-sm font-semibold border border-border hover:bg-surface-active text-foreground transition disabled:opacity-50 cursor-pointer"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="px-4 py-2 rounded text-sm font-semibold bg-danger hover:bg-danger-hover text-white transition disabled:opacity-50 cursor-pointer"
                    >
                        {isSubmitting ? "Applying..." : "Confirm Ban"}
                    </button>
                </div>
            </form>
        </Modal>
    );
}