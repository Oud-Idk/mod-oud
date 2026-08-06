"use client";

import React, { FormEvent, ReactNode, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { ReminderRow, ReminderType, SaveableReminder } from "@/features/reminders/types";
import { LongTextInput } from "@/components/ui/LongTextInput";
import { InputLabel } from "@/components/layout/InputLabel";
import { Button } from "@/components/ui/Button";

interface ReminderCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (reminder: SaveableReminder) => Promise<ReminderRow>;
    channelMap: Record<string, string>;
}

export function ReminderCreateModal({
    isOpen,
    onClose,
    onSave,
    channelMap,
}: ReminderCreateModalProps): ReactNode {
    const [submitting, setSubmitting] = useState(false);
    const [channelId, setChannelId] = useState("");
    const [content, setContent] = useState("");
    const [rType, setRType] = useState<ReminderType>("SINGLE");

    if (!isOpen) return null;

    const channelOptions = Object.entries(channelMap).map(([id, name]) => ({
        value: id,
        label: name,
    }));

    const handleSubmit = async (e: FormEvent): Promise<void> => {
        e.preventDefault();
        if (!channelId) return;

        setSubmitting(true);
        try {
            await onSave({
                channelId,
                format: "TEXT",
                content: content.trim() || "New reminder scheduled",
                embed: null,
                rType,
                // Defaults scheduling to 5 minutes from now
                nextTriggerAt: new Date(Date.now() + 60 * 1000 * 5).toISOString(),
                daysOfWeek: null,
                timeStart: null,
                timeEnd: null,
                intervalSeconds: rType === "RECURRING" ? 3600 : null,
                isActive: true,
            });
            onClose();
            setContent("");
        } catch (error) {
            console.error("Error creating reminder:", error);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal onClose={onClose} headerText="Create New Reminder">
            <p className="-mt-1 mb-5 text-xs text-muted-foreground">
                Add a quick single or recurring announcement for your community.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                    <InputLabel>
                        Target Channel
                    </InputLabel>
                    <Dropdown
                        options={channelOptions}
                        value={channelId}
                        onChange={setChannelId}
                        placeholder="Select a channel"
                    />
                </div>

                <div className="space-y-1.5">
                    <InputLabel>
                        Reminder Content
                    </InputLabel>
                    <LongTextInput
                        value={content}
                        onChange={(e) => setContent(e.target.value)}
                        placeholder="Enter announcement text..."
                        rows={3}
                        required
                    />
                </div>

                <div className="space-y-1.5">
                    <InputLabel>
                        Schedule Style
                    </InputLabel>
                    <Dropdown
                        options={[
                            { value: "SINGLE", label: "One-Time (Single)" },
                            { value: "RECURRING", label: "Recurring Interval" },
                        ]}
                        value={rType}
                        onChange={(val) => setRType(val as ReminderType)}
                        placeholder="Select schedule type"
                    />
                </div>

                <div className="flex justify-end gap-3 ">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={submitting || !channelId}
                    >
                        {submitting ? "Creating..." : "Create Reminder"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}