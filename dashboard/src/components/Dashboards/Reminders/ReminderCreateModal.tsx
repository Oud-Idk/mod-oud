"use client";

import React, { FormEvent, useState } from "react";
import { Dropdown } from "@/components/Inputs/Dropdown";

import { SaveableReminder } from "@/types/db/reminder";
import { ReminderType } from "@/types/db";

interface ReminderCreateModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (reminder: SaveableReminder) => Promise<any>;
    channelMap: Record<string, string>;
}

export function ReminderCreateModal({
    isOpen,
    onClose,
    onSave,
    channelMap,
}: ReminderCreateModalProps) {
    const [submitting, setSubmitting] = useState(false);
    const [channelId, setChannelId] = useState("");
    const [content, setContent] = useState("");
    const [rType, setRType] = useState<ReminderType>("SINGLE");

    if (!isOpen) return null;

    const channelOptions = Object.entries(channelMap).map(([id, name]) => ({
        value: id,
        label: name,
    }));

    const handleSubmit = async (e: FormEvent) => {
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-md w-full p-6 space-y-4 shadow-xl">
                <div>
                    <h3 className="text-base font-bold text-zinc-100">Create New Reminder</h3>
                    <p className="text-xs text-zinc-500">Add a quick single or recurring announcement.</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase text-zinc-400">Target Channel</label>
                        <Dropdown
                            options={channelOptions}
                            value={channelId}
                            onChange={setChannelId}
                            placeholder="Select a channel"
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase text-zinc-400">Reminder Content</label>
                        <textarea
                            value={content}
                            onChange={(e) => setContent(e.target.value)}
                            placeholder="Enter announcement text..."
                            className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-zinc-700"
                            rows={3}
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <label className="text-xs font-semibold uppercase text-zinc-400">Schedule Style</label>
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

                    <div className="flex justify-end gap-2 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={submitting}
                            className="text-xs border border-zinc-800 hover:bg-zinc-800 px-4 py-2 rounded transition cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={submitting || !channelId}
                            className="text-xs bg-zinc-100 hover:bg-zinc-200 text-zinc-950 font-bold px-4 py-2 rounded transition disabled:opacity-50 cursor-pointer"
                        >
                            {submitting ? "Creating..." : "Create Reminder"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}