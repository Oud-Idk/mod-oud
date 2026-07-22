"use client";

import React from "react";
import { Dropdown } from "@/components/Inputs/Dropdown";
import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";

import { ReminderRow } from "@/types/db/reminder";
import { ReminderType } from "@/types/db";

interface ReminderConfigProps {
    config: ReminderRow;
    channelMap: Record<string, string>;
    isPending: boolean;
    onDelete: (id: string) => Promise<void>;
    onChange: (config: Partial<ReminderRow>) => void;
    setIsEmpty: (isEmpty: boolean) => void;
}

const DAYS_OF_WEEK = [
    { label: "Sun", value: 0 },
    { label: "Mon", value: 1 },
    { label: "Tue", value: 2 },
    { label: "Wed", value: 3 },
    { label: "Thu", value: 4 },
    { label: "Fri", value: 5 },
    { label: "Sat", value: 6 },
];

export function ReminderConfig({
    config,
    channelMap,
    isPending,
    onDelete,
    onChange,
}: ReminderConfigProps) {
    const channelOptions = Object.entries(channelMap).map(([id, name]) => ({
        value: id,
        label: name,
    }));

    const formatOptions = [
        { value: "TEXT", label: "Plain Text" },
        { value: "EMBED", label: "Discord Rich Embed" },
    ];

    const typeOptions = [
        { value: "SINGLE", label: "One-Time (Single)" },
        { value: "RECURRING", label: "Recurring Schedule" },
    ];

    const handleDayToggle = (dayValue: number) => {
        const currentDays = config.daysOfWeek || [];
        const updated = currentDays.includes(dayValue)
            ? currentDays.filter((d) => d !== dayValue)
            : [...currentDays, dayValue].sort();
        onChange({ daysOfWeek: updated.length > 0 ? updated : null });
    };

    const handleTimeChange = (field: "timeStart" | "timeEnd", value: string) => {
        const formattedTime = !value
            ? null
            : (value.split(":").length === 2 ? `${value}:00` : value);

        onChange({ [field]: formattedTime });
    };

    const getFormattedDateTime = (isoString?: string) => {
        if (!isoString) return "";
        const d = new Date(isoString);
        if (isNaN(d.getTime())) return "";
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const hours = String(d.getHours()).padStart(2, "0");
        const minutes = String(d.getMinutes()).padStart(2, "0");
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    // Strip seconds from HH:MM:SS for the native HTML time input
    const formatTimeForInput = (timeStr: string | null) => {
        if (!timeStr) return "";
        const parts = timeStr.split(":");
        return parts.slice(0, 2).join(":");
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-zinc-800">
                <div className="space-y-1">
                    <span className="block text-xs uppercase text-zinc-500 font-semibold tracking-wider">
                        Reminder Configuration
                    </span>
                    <h2 className="text-lg font-bold text-zinc-150">
                        {config.rType === "RECURRING" ? "Recurring Schedule" : "One-Time Reminder"}
                    </h2>
                </div>
                <button
                    onClick={() => onDelete(config.id)}
                    disabled={isPending}
                    className="text-xs border border-red-500 hover:bg-red-500/10 px-3 py-1.5 rounded transition disabled:opacity-50 cursor-pointer"
                >
                    Delete Reminder
                </button>
            </div>

            <ToggleSwitch
                checked={config.isActive}
                onChange={(checked) => onChange({ isActive: checked })}
                disabled={false}
                text="Enable / Schedule Active"
                shrink={true}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-zinc-300">Target Channel</label>
                    <Dropdown
                        options={channelOptions}
                        value={config.channelId}
                        onChange={(val) => onChange({ channelId: val })}
                        placeholder="Select channel"
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-zinc-300">Message Format</label>
                    <Dropdown
                        options={formatOptions}
                        value={config.format}
                        onChange={(val) => onChange({ format: val as any })}
                        placeholder="Select format"
                    />
                </div>
            </div>

            {(config.format === "TEXT" && (
                <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-zinc-300">Message Content</label>
                    <textarea
                        value={config.content || ""}
                        onChange={(e) => onChange({ content: e.target.value })}
                        placeholder="Type the message to send..."
                        rows={4}
                        className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-700"
                    />
                </div>
            ))}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-zinc-800">
                <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-zinc-300">Reminder Type</label>
                    <Dropdown
                        options={typeOptions} value={config.rType} onChange={(val) => {
                        const nextType = val as ReminderType;
                        onChange({
                            rType: nextType,
                            nextTriggerAt: nextType === "RECURRING" ? new Date().toISOString() : config.nextTriggerAt
                        });
                    }} placeholder="Select type"
                    />
                </div>

                <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-zinc-300">Next Scheduled Trigger</label>
                    {config.rType === "RECURRING" ? (
                        <div className="bg-zinc-950/40 border border-zinc-800/80 rounded px-3 py-2 text-xs text-zinc-500">
                            Managed and calculated automatically by the scheduling worker based on your recurrence
                            rules. </div>
                    ) : (
                        <input
                            type="datetime-local"
                            value={getFormattedDateTime(config.nextTriggerAt)}
                            onChange={(e) => {
                                if (e.target.value) {
                                    onChange({ nextTriggerAt: new Date(e.target.value).toISOString() });
                                }
                            }}
                            className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700"
                        />
                    )}
                </div>
            </div>

            {config.rType === "RECURRING" && (
                <div className="space-y-5 pt-4 border-t border-zinc-800">
                    <div>
                        <h3 className="font-semibold text-sm text-zinc-300">Recurrence Details</h3>
                        <p className="text-xs text-zinc-500">Specify when and how often this reminder executes.</p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-xs uppercase text-zinc-500 font-bold tracking-wider block">
                            Active Days of the Week <span className="text-red-500/80">*</span>
                        </label>
                        <div className="flex flex-wrap gap-2">
                            {DAYS_OF_WEEK.map((day) => {
                                const isSelected = (config.daysOfWeek || []).includes(day.value);
                                return (
                                    <button
                                        type="button"
                                        key={day.value}
                                        onClick={() => handleDayToggle(day.value)}
                                        className={`px-3 py-1.5 text-xs rounded border transition cursor-pointer ${
                                            isSelected
                                                ? "bg-zinc-200 text-zinc-950 border-zinc-200 font-medium"
                                                : "bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                                        }`}
                                    >
                                        {day.label}
                                    </button>
                                );
                            })}
                        </div>
                        <span className="text-xs text-zinc-500 block">
                            Select specific days, or leave all unselected to run every day of the week.
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <label className="text-xs uppercase text-zinc-500 font-bold tracking-wider block">
                                Time Range Start
                            </label>
                            <input
                                type="time"
                                value={formatTimeForInput(config.timeStart)}
                                onChange={(e) => handleTimeChange("timeStart", e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs uppercase text-zinc-500 font-bold tracking-wider block">
                                Time Range End
                            </label>
                            <input
                                type="time"
                                value={formatTimeForInput(config.timeEnd)}
                                onChange={(e) => handleTimeChange("timeEnd", e.target.value)}
                                className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none focus:border-zinc-700"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-xs uppercase text-zinc-500 font-bold tracking-wider block">
                                Interval (Seconds)
                            </label>
                            <input
                                type="number"
                                min={10}
                                value={config.intervalSeconds || ""}
                                onChange={(e) => {
                                    const val = parseInt(e.target.value, 10);
                                    onChange({ intervalSeconds: isNaN(val) ? null : val });
                                }}
                                placeholder="Once per day"
                                className="w-full bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm text-zinc-200 focus:outline-none"
                            />
                        </div>
                    </div>
                    <span className="text-xs text-zinc-500 block">
                        💡 Leave <strong>Interval</strong> blank to run the reminder exactly once per day at your start
                        time. Provide an interval to repeat it periodically between your start and end times.
                    </span>
                </div>
            )}
        </div>
    );
}