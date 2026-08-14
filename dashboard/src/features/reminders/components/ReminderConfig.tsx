"use client";

import React, { JSX, useMemo } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { Button } from "@/components/ui/Button";
import { InputLabel } from "@/components/layout/InputLabel";
import { LongTextInput } from "@/components/ui/LongTextInput";
import Footer from "@/components/layout/Footer";
import { NumberInput } from "@/components/ui/NumberInput";
import { TimeInput } from "@/components/ui/TimeInput";
import { getAvailableChannelOptions } from "@/features/_shared/dropdown";
import { saveableReminderSchema, type ReminderFormat, type ReminderRow, type ReminderType } from "../types";
import { toast } from "sonner";
import { TextInput } from "@/components/ui/TextInput";

interface ReminderConfigProps {
    config: ReminderRow;
    channelMap: Record<string, string>;
    isPending: boolean;
    onDelete: (id: string) => Promise<void>;
    onChange: (config: Partial<ReminderRow>) => void;
    setIsEmpty: (isEmpty: boolean) => void;
    isEmpty: boolean;
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
}: ReminderConfigProps): JSX.Element {
    const validationResult = useMemo(() => {
        return saveableReminderSchema.safeParse(config);
    }, [config]);

    const handleDelete = async (): Promise<void> => {
        try {
            await onDelete(config.id);
            toast.success("Reminder deleted successfully");
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to delete reminder");
        }
    };

    const formatOptions: { value: ReminderFormat; label: string }[] = [
        { value: "TEXT", label: "Plain Text" },
        { value: "EMBED", label: "Discord Rich Embed" },
    ];

    const typeOptions: { value: ReminderType; label: string }[] = [
        { value: "SINGLE", label: "One-Time (Single)" },
        { value: "RECURRING", label: "Recurring Schedule" },
    ];

    const handleDayToggle = (dayValue: number): void => {
        const currentDays = config.daysOfWeek ?? [];
        const updated = currentDays.includes(dayValue)
            ? currentDays.filter((d) => d !== dayValue)
            : [...currentDays, dayValue].sort();
        onChange({ daysOfWeek: updated.length > 0 ? updated : null });
    };

    const handleTimeChange = (field: "timeStart" | "timeEnd", value: string): void => {
        const formattedTime =
            value === ""
                ? null
                : value.split(":").length === 2
                    ? `${value}:00`
                    : value;

        onChange({ [field]: formattedTime });
    };

    const getFormattedDateTime = (isoString?: string): string => {
        if (isoString === undefined || isoString === "") return "";
        const d = new Date(isoString);
        if (Number.isNaN(d.getTime())) return "";
        const year = String(d.getFullYear());
        const month = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const hours = String(d.getHours()).padStart(2, "0");
        const minutes = String(d.getMinutes()).padStart(2, "0");
        return `${year}-${month}-${day}T${hours}:${minutes}`;
    };

    const formatTimeForInput = (timeStr: string | null): string => {
        if (timeStr === null || timeStr === "") return "";
        const parts = timeStr.split(":");
        return parts.slice(0, 2).join(":");
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-border-subtle gap-4">
                <div className="space-y-0.5">
                    <span className="block text-xs uppercase font-semibold tracking-wider text-muted-foreground">
                        Reminder Configuration
                    </span>
                    <h2 className="text-lg font-bold text-foreground">
                        {config.rType === "RECURRING" ? "Recurring Schedule" : "One-Time Reminder"}
                    </h2>
                </div>
                <Button
                    variant="danger"
                    type="button"
                    onClick={() => { void handleDelete(); }}
                    disabled={isPending}
                >
                    Delete Reminder
                </Button>
            </div>

            {!validationResult.success && (
                <div className="p-3 rounded-lg border border-warning/30 bg-warning-subtle text-warning-foreground text-xs font-medium flex items-center gap-2">
                    <span>⚠️</span>
                    <span>
                        {validationResult.error.issues[0]?.message ?? "Please complete required reminder fields before saving."}
                    </span>
                </div>
            )}

            <ToggleSwitch
                checked={config.isActive}
                onChange={(checked) => { onChange({ isActive: checked }); }}
                disabled={false}
                text="Enable / Schedule Active"
                shrink={true}
            />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                    <InputLabel>Target Channel</InputLabel>
                    <Dropdown
                        options={getAvailableChannelOptions(channelMap)}
                        value={config.channelId ?? ""}
                        onChange={(val) => { onChange({ channelId: val }); }}
                        placeholder="Select channel"
                    />
                </div>

                <div className="space-y-1.5">
                    <InputLabel>Message Format</InputLabel>
                    <Dropdown
                        options={formatOptions}
                        value={config.message.format}
                        onChange={(val) => { onChange({ message: { ...config.message, format: val ?? "TEXT" } }); }}
                        placeholder="Select format"
                    />
                </div>
            </div>

            {config.message.format === "TEXT" && (
                <div className="space-y-1.5">
                    <InputLabel>Message Content</InputLabel>
                    <LongTextInput
                        value={config.message.content}
                        onChange={(e) => { onChange({ message: { ...config.message, content: e.target.value } }); }}
                        placeholder="Type the message to send..."
                        rows={4}
                    />
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border-subtle">
                <div className="space-y-1.5">
                    <InputLabel>Reminder Type</InputLabel>
                    <Dropdown
                        options={typeOptions}
                        value={config.rType}
                        onChange={(val) => {
                            onChange({
                                rType: val ?? "SINGLE",
                                nextTriggerAt:
                                    val === "RECURRING"
                                        ? new Date()
                                        : config.nextTriggerAt,
                            });
                        }}
                        placeholder="Select type"
                    />
                </div>

                <div className="space-y-1.5">
                    <InputLabel>Next Scheduled Trigger</InputLabel>
                    {config.rType === "RECURRING" ? (
                        <div className="bg-surface-muted border border-border-subtle rounded-lg px-4 py-2.5 text-xs text-muted-foreground">
                            {new Date(config.nextTriggerAt).toLocaleString()}
                        </div>
                    ) : (
                        <TextInput
                            type="datetime-local"
                            value={getFormattedDateTime(config.nextTriggerAt.toISOString())}
                            onChange={(e) => {
                                if (e.target.value !== "") {
                                    onChange({
                                        nextTriggerAt: new Date(e.target.value),
                                    });
                                }
                            }}
                        />
                    )}
                </div>
            </div>

            {config.rType === "RECURRING" && (
                <div className="space-y-5 pt-4 border-t border-border-subtle">
                    <div>
                        <h3 className="font-semibold text-sm text-foreground">Recurrence Details</h3>
                        <Footer>
                            Specify when and how often this reminder executes.
                        </Footer>
                    </div>

                    <div className="space-y-2">
                        <InputLabel>Active Days of the Week</InputLabel>
                        <div className="flex flex-wrap gap-2">
                            {DAYS_OF_WEEK.map((day) => {
                                const isSelected = (config.daysOfWeek ?? []).includes(day.value);
                                return (
                                    <Button
                                        type="button"
                                        key={day.value}
                                        onClick={() => { handleDayToggle(day.value); }}
                                        className={`px-3 py-1.5 text-xs rounded-md transition cursor-pointer border ${
                                            isSelected
                                                ? "bg-brand-subtle text-brand-foreground border-brand font-medium hover:bg-brand-subtle/80"
                                                : "bg-surface-muted border-border text-foreground hover:bg-surface-active hover:text-foreground"
                                        }`}
                                    >
                                        {day.label}
                                    </Button>
                                );
                            })}
                        </div>
                        <span className="text-xs text-muted-foreground block">
                            Select specific days, or leave all unselected to run every day of the week.
                        </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-1.5">
                            <InputLabel>Time Range Start</InputLabel>
                            <TimeInput
                                value={formatTimeForInput(config.timeStart)}
                                onChange={(e) => { handleTimeChange("timeStart", e.target.value); }}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <InputLabel>Time Range End</InputLabel>
                            <TimeInput
                                value={formatTimeForInput(config.timeEnd)}
                                onChange={(e) => { handleTimeChange("timeEnd", e.target.value); }}
                            />
                        </div>

                        <div className="space-y-1.5">
                            <InputLabel>Interval (Seconds)</InputLabel>
                            <NumberInput
                                min={10}
                                value={config.intervalSeconds}
                                onChange={(n) => { onChange({ intervalSeconds: n }); }}
                                placeholder="Once per day"
                            />
                        </div>
                    </div>

                    <span className="text-xs text-muted-foreground block leading-relaxed">
                        💡 Leave <strong>Interval</strong> blank to run the reminder exactly once per day at your start
                        time. Provide an interval to repeat it periodically between your start and end times.
                    </span>
                </div>
            )}
        </div>
    );
}