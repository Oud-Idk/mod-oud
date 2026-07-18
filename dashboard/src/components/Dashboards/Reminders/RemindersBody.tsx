"use client";

import React, { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ReminderRow, SaveableReminder } from "@/utils/db/reminder";
import { ConfigListLayout } from "@/components/Dashboards/General/ConfigListLayout";
import { ReminderCreateModal } from "./ReminderCreateModal";
import { ReminderConfig } from "./ReminderConfig";
import { useConfigForm } from "@/hooks/useConfigForm";

interface RemindersBodyProps {
    reminders: ReminderRow[];
    activeReminder: ReminderRow | null;
    channelMap: Record<string, string>;
    onSave: (reminder: SaveableReminder) => Promise<any>;
    onDelete: (id: string, channelId: string) => Promise<void>;
}

export function RemindersBody({
    reminders,
    activeReminder,
    channelMap,
    onSave,
    onDelete,
}: RemindersBodyProps) {
    const router = useRouter();
    const params = useParams();
    const guildId = params?.guild_id as string;

    const {
        config,
        isPending,
        isDirty,
        setIsEmpty,
        handleSave,
        handleCancel,
        handleChange,
    } = useConfigForm<SaveableReminder | null>({
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

    const handleDelete = async (id: string, channelId: string) => {
        await onDelete(id, channelId);
        router.push(`/dashboard/${guildId}/reminders`);
    };

    return (
        <>
            <ConfigListLayout<ReminderRow> title="Reminders"
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

                    const typeLabel = reminder.rType === "recurring" ? "Recurring" : "Single";
                    let scheduleText = "";
                    if (reminder.rType === "recurring") {
                        if (reminder.daysOfWeek && reminder.daysOfWeek.length > 0) {
                            const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
                            scheduleText = reminder.daysOfWeek.map(d => days[d]).join(", ");
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
                            className={`w-full text-left px-3 py-2 rounded text-sm transition block cursor-pointer truncate ${
                                isCurrent
                                    ? "bg-neutral-400/15 hover:bg-neutral-400/20 font-medium"
                                    : "hover:bg-neutral-300/15"
                            }`}
                        >
                            <div className="flex justify-between items-center">
                                <span className="truncate font-semibold text-zinc-200">
                                    {reminder.content ? reminder.content : "Rich Embed Message"}
                                </span>
                                <span
                                    className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                        reminder.isActive ? "bg-emerald-500/10 text-emerald-500" : "bg-neutral-500/10 text-neutral-400"
                                    }`}
                                >
                                    {reminder.isActive ? "Active" : "Paused"}
                                </span>
                            </div>
                            <div className="text-xs text-zinc-500 truncate mt-0.5">
                                {channelName} • {typeLabel} {scheduleText && `(${scheduleText})`}
                            </div>
                        </button>
                    );
                }}
                noActivePlaceholder={
                    <div className="text-center py-8 space-y-4">
                        <p className="text-sm text-zinc-400">Select a reminder or create a new one to get started.</p>
                        <button
                            onClick={() => setIsCreateModalOpen(true)}
                            className="text-xs px-3.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded transition border border-neutral-750 cursor-pointer"
                        >
                            Create Your First Reminder
                        </button>
                    </div>
                }
            >
                {config && (
                    <ReminderConfig
                        config={config as ReminderRow}
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