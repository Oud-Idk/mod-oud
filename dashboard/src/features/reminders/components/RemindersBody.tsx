"use client";

import React, { ReactNode, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfigListLayout } from "@/components/dashboard/ConfigListLayout";

import { ReminderCreateModal } from "./ReminderCreateModal";
import { ReminderConfig } from "./ReminderConfig";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import type { ReminderRow, SaveableReminder } from "../types";
import { Button } from "@/components/ui/Button";

interface RemindersBodyProps {
    reminders: ReminderRow[];
    activeReminder: ReminderRow | null;
    channelMap: Record<string, string>;
    onSave: (reminder: SaveableReminder) => Promise<ReminderRow>;
    onDelete: (id: string, channelId: string) => Promise<void>;
    guildId: string;
}

export function RemindersBody({
    reminders,
    activeReminder,
    channelMap,
    onSave,
    onDelete,
    guildId,
}: RemindersBodyProps): ReactNode {
    const router = useRouter();

    const {
        config,
        isPending,
        isDirty,
        setIsEmpty,
        handleSave,
        handleCancel,
        handleChange,
    } = useConfigForm<ReminderRow | null>({
        initialConfig: activeReminder,
        onSave: async (updatedConfig) => {
            if (updatedConfig) {
                const res = await onSave(updatedConfig);
                if (res?.id) {
                    router.push(`/dashboard/${guildId}/reminders?id=${res.id}`);
                }
            }
        },
    });

    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

    const handleDelete = async (id: string, channelId: string): Promise<void> => {
        await onDelete(id, channelId);
        router.push(`/dashboard/${guildId}/reminders`);
    };

    return (
        <>
            <ConfigListLayout<ReminderRow>
                title="Reminders"
                onCreateClick={() => setIsCreateModalOpen(true)}
                items={reminders}
                emptyMessage="No reminders scheduled yet."
                hasActiveConfig={!!config}
                isDirty={isDirty}
                isPending={isPending}
                handleSave={handleSave}
                handleCancel={handleCancel}
                renderItem={(reminder) => {
                    const isCurrent = activeReminder?.id === reminder.id;
                    const channelName = channelMap[reminder.channelId] || `#${reminder.channelId}`;

                    const typeLabel = reminder.rType === "RECURRING" ? "Recurring" : "Single";
                    let scheduleText = "";
                    if (reminder.rType === "RECURRING") {
                        if (reminder.daysOfWeek && reminder.daysOfWeek.length > 0) {
                            const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                            scheduleText = reminder.daysOfWeek.map((d) => days[d]).join(", ");
                        } else if (reminder.intervalSeconds) {
                            scheduleText = `${reminder.intervalSeconds}s`;
                        }
                    } else {
                        scheduleText = new Date(reminder.nextTriggerAt).toLocaleDateString();
                    }

                    return (
                        <button
                            key={reminder.id}
                            onClick={() => router.push(`/dashboard/${guildId}/reminders?id=${reminder.id}`)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition block cursor-pointer truncate ${
                                isCurrent
                                    ? "bg-surface-active font-medium"
                                    : "hover:bg-surface-muted text-foreground"
                            }`}
                        >
                            <div className="flex justify-between items-center gap-2">
                                <span className="truncate font-semibold text-foreground">
                                    {reminder.content ? reminder.content : "Rich Embed Message"}
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
                                {channelName} • {typeLabel} {scheduleText && `(${scheduleText})`}
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
                                Create a one-time reminder, or a recurring reminder to remind yourself or your members of something.
                            </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <Button onClick={() => setIsCreateModalOpen(true)}>
                                Create Reminder
                            </Button>
                        </div>
                    </div>
                }
            >
                {config && (
                    <ReminderConfig
                        config={config}
                        channelMap={channelMap}
                        isPending={isPending}
                        onDelete={(id) => handleDelete(id, config.channelId)}
                        onChange={handleChange}
                        setIsEmpty={setIsEmpty}
                    />
                )}
            </ConfigListLayout>

            <ReminderCreateModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                onSave={onSave}
                channelMap={channelMap}
            />
        </>
    );
}