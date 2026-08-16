"use client";

import React, { JSX, useState, useTransition } from "react";
import { Modal } from "@/components/ui/Modal";
import { Dropdown } from "@/components/ui/Dropdown";
import { LongTextInput } from "@/components/ui/LongTextInput";
import { InputLabel } from "@/components/layout/InputLabel";
import { Button } from "@/components/ui/Button";
import { getAvailableChannelOptions } from "@/features/_shared/dropdown";
import { toast } from "sonner";
import type { ReminderRow, ReminderType, SaveableReminderInput } from "../types";

interface ReminderCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (reminder: SaveableReminderInput) => Promise<ReminderRow>;
    channelMap: Record<string, string>;
}

export function ReminderCreateModal({
    isOpen,
    onClose,
    onSave,
    channelMap,
}: ReminderCreateModalProps): JSX.Element | null {
    const [isPending, startTransition] = useTransition();
    const [channelId, setChannelId] = useState<string | null>(null);
    const [content, setContent] = useState("");
    const [rType, setRType] = useState<ReminderType>("SINGLE");

    if (!isOpen) return null;

    const handleSubmit = (e: React.SubmitEvent): void => {
        e.preventDefault();

        if (channelId === null) {
            toast.error("Please select a target channel.");
            return;
        }

        startTransition(async () => {
            try {
                await onSave({
                    channelId,
                    message: {
                        format: "TEXT",
                        content: content.trim() !== "" ? content : "New reminder scheduled",
                        embed: {},
                    },
                    rType,
                    nextTriggerAt: new Date(Date.now() + 60 * 1000 * 5),
                    daysOfWeek: null,
                    timeStart: null,
                    timeEnd: null,
                    intervalSeconds: rType === "RECURRING" ? 3600 : null,
                    isActive: true,
                });
                toast.success("Reminder created successfully");
                onClose();
                setChannelId(null);
                setContent("");
            } catch (error) {
                toast.error(error instanceof Error ? error.message : "Failed to create reminder.");
            }
        });
    };

    return (
        <Modal onClose={onClose} headerText="Create New Reminder">
            <p className="-mt-1 mb-5 text-xs text-muted-foreground">
                Add a quick single or recurring announcement for your community.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                    <InputLabel>Target Channel</InputLabel>
                    <Dropdown
                        options={getAvailableChannelOptions(channelMap)}
                        value={channelId ?? ""}
                        onChange={(val) =>{  setChannelId(val ?? null); }}
                        placeholder="Select a channel"
                    />
                </div>

                <div className="space-y-1.5">
                    <InputLabel>Reminder Content</InputLabel>
                    <LongTextInput
                        value={content}
                        onChange={(e) =>{  setContent(e.target.value); }}
                        placeholder="Enter announcement text..."
                        rows={3}
                        required
                    />
                </div>

                <div className="space-y-1.5">
                    <InputLabel>Schedule Style</InputLabel>
                    <Dropdown
                        options={[
                            { value: "SINGLE", label: "One-Time (Single)" },
                            { value: "RECURRING", label: "Recurring Interval" },
                        ]}
                        value={rType}
                        onChange={(val) =>{  setRType(val ?? "SINGLE"); }}
                        placeholder="Select schedule type"
                    />
                </div>

                <div className="flex justify-end gap-3 pt-2">
                    <Button
                        variant="secondary"
                        onClick={onClose}
                        disabled={isPending}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={isPending || channelId === null}
                    >
                        {isPending ? "Creating..." : "Create Reminder"}
                    </Button>
                </div>
            </form>
        </Modal>
    );
}