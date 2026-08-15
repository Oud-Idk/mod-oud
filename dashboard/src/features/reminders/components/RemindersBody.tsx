"use client";

import React, { useState, useCallback, JSX } from "react";
import { useRouter } from "next/navigation";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { Button } from "@/components/ui/Button";

import { ReminderCreateModal } from "./ReminderCreateModal";
import { ReminderConfig } from "./ReminderConfig";
import type { ReminderRow, SaveableReminderInput } from "../types";
import { saveableReminderSchema } from "../types";
import { toast } from "sonner";

interface RemindersBodyProps {
    reminders: ReminderRow[];
    activeReminder: ReminderRow | null;
    channelMap: Record<string, string>;
    onSave: (reminder: SaveableReminderInput) => Promise<ReminderRow>;
    onDelete: (id: string, channelId: string | null) => Promise<void>;
    guildId: string;
}

export function RemindersBody({
    reminders,
    activeReminder,
    channelMap,
    onSave,
    onDelete,
    guildId,
}: RemindersBodyProps): JSX.Element {
    const router = useRouter();
    const [isEmpty, setIsEmpty] = useState(false);

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        handleSave: originalHandleSave,
        handleCancel,
    } = useConfigForm<ReminderRow | null>({
        initialConfig: activeReminder,
        onSave: async (updatedConfig) => {
            if (updatedConfig !== null) {
                const res = await onSave(updatedConfig);
                if (res.id !== "") {
                    router.push(`/dashboard/${guildId}/reminders?id=${res.id}`);
                }
            }
        },
    });

    const handleSave = useCallback((): void => {
        if (config === null) return;
        const result = saveableReminderSchema.safeParse(config);
        if (!result.success) {
            toast.error(result.error.issues[0].message);
            return;
        }
        void originalHandleSave();
    }, [config, originalHandleSave]);

    const handleChange = useCallback((updated: Partial<ReminderRow>): void => {
        setConfig((prev) => (prev !== null ? { ...prev, ...updated } : null));
    }, [setConfig]);

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const handleDelete = async (id: string, channelId: string | null): Promise<void> => {
        try {
            await onDelete(id, channelId);
            toast.success("Reminder deleted successfully");
            router.push(`/dashboard/${guildId}/reminders`);
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to delete reminder");
        }
    };

    return (
        <div>
            <ConfigListLayout<ReminderRow>
                title="Reminders"
                onCreateClick={() => { setIsCreateModalOpen(true); }}
                items={reminders}
                emptyMessage="No reminders scheduled yet."
                hasActiveConfig={config !== null}
                handleSave={handleSave}
                handleCancel={handleCancel}
                renderItem={(reminder) => {
                    const isCurrent = activeReminder?.id === reminder.id;
                    let channelName = "Unassigned Channel";
                    if (reminder.channelId !== null && reminder.channelId !== "") {
                        const name = channelMap[reminder.channelId];
                        channelName = name !== "" ? name : `#${reminder.channelId}`;
                    }

                    const typeLabel = reminder.rType === "RECURRING" ? "Recurring" : "Single";
                    let scheduleText = "";
                    if (reminder.rType === "RECURRING") {
                        if (reminder.daysOfWeek !== null && reminder.daysOfWeek.length > 0) {
                            const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                            scheduleText = reminder.daysOfWeek.map((d) => days[d]).join(", ");
                        } else if (
                            reminder.intervalSeconds !== null &&
                            reminder.intervalSeconds > 0
                        ) {
                            scheduleText = `${String(reminder.intervalSeconds)}s`;
                        }
                    } else {
                        scheduleText = new Date(reminder.nextTriggerAt).toLocaleDateString();
                    }

                    return (
                        <button
                            key={reminder.id}
                            onClick={() => { router.push(`/dashboard/${guildId}/reminders?id=${reminder.id}`); }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition block cursor-pointer truncate ${
                                isCurrent
                                    ? "bg-surface-active font-medium"
                                    : "hover:bg-surface-muted text-foreground"
                            }`}
                        >
                            <div className="flex justify-between items-center gap-2">
                                <span className="truncate font-semibold text-foreground">
                                    {reminder.message.content !== "" ? reminder.message.content : "Rich Embed Message"}
                                </span>
                                <span
                                    className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                        reminder.isActive
                                            ? "bg-success-subtle text-success"
                                            : "bg-surface-muted text-muted-foreground"
                                    }`}
                                >
                                    {reminder.isActive ? "Active" : "Paused"}
                                </span>
                            </div>
                            <div className="text-xs text-muted-foreground truncate mt-0.5">
                                {channelName} • {typeLabel} {scheduleText !== "" && `(${scheduleText})`}
                            </div>
                        </button>
                    );
                }}
                noActivePlaceholder={
                    <div className="max-w-md mx-auto space-y-4 flex items-center flex-col text-center">
                        <div className="space-y-1">
                            <h3 className="text-lg font-semibold text-foreground">
                                Manage Reminders
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Create a one-time reminder, or a recurring reminder to trigger automatically.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={() => { setIsCreateModalOpen(true); }}>
                                Create Reminder
                            </Button>
                        </div>
                    </div>
                }
            >
                {config !== null && (
                    <ReminderConfig
                        config={config}
                        channelMap={channelMap}
                        isPending={isPending}
                        onDelete={(id) => handleDelete(id, config.channelId)}
                        onChange={handleChange}
                        setIsEmpty={setIsEmpty}
                        isEmpty={isEmpty}
                    />
                )}
            </ConfigListLayout>

            <ReminderCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => { setIsCreateModalOpen(false); }}
                onSave={onSave}
                channelMap={channelMap}
            />

            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel}
                    handleSave={handleSave}
                    isSaving={isPending}
                />
            )}
        </div>
    );
}