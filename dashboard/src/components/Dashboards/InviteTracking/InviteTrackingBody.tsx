"use client";

import React, { useState, useTransition } from "react";
import { ToggleSwitch } from "@/components/Dashboards/General/ToggleSwitch";
import { SavePopup } from "@/components/Dashboards/General/SavePopup";
import { InviteTrackerConfig, LeaderboardEntry } from "@/utils/db/config";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/Layout/Table";

interface InviteTrackerBodyProps {
    guildId: string;
    initialConfig: InviteTrackerConfig;
    leaderboard: LeaderboardEntry[];
    onSave: (config: InviteTrackerConfig) => Promise<void>;
}

export function InviteTrackingBody({
    guildId,
    initialConfig,
    leaderboard,
    onSave,
}: InviteTrackerBodyProps) {
    const [config, setConfig] = useState<InviteTrackerConfig>(initialConfig);
    const [isPending, startTransition] = useTransition();

    const isDirty = config.enabled !== initialConfig.enabled;

    const handleToggle = (checked: boolean) => {
        setConfig((prev) => ({ ...prev, enabled: checked }));
    };

    const handleSave = () => {
        startTransition(async () => {
            try {
                await onSave(config);
            } catch (error) {
                alert(error instanceof Error ? error.message : "Failed to update configuration.");
            }
        });
    };

    const handleCancel = () => {
        setConfig(initialConfig);
    };

    return (
        <div className="flex-1 scrollbar-thin pr-2 pb-12 space-y-6">
            {/* Status Panel Control */}
            <div className="border border-neutral-200 dark:border-neutral-800 p-5 rounded-xl bg-white dark:bg-zinc-900/50 space-y-2">
                <div className="flex items-center justify-between">
                    <div>
                        <h3 className="font-semibold text-neutral-900 dark:text-zinc-100">Tracking System</h3>
                        <p className="text-xs text-neutral-500 dark:text-zinc-400">
                            Monitor new member attributions back to their respective inviters. </p>
                    </div>
                    <ToggleSwitch
                        checked={config.enabled} onChange={handleToggle} disabled={isPending} text="Enable Tracking"
                    />
                </div>
            </div>

            {/* Leaderboard Module */}
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-xl bg-white dark:bg-zinc-900/50 p-6 space-y-4">
                <div>
                    <h3 className="text-lg font-semibold text-neutral-900 dark:text-zinc-100">Invite Leaderboard</h3>
                    <p className="text-xs text-neutral-500 dark:text-zinc-400">
                        Top active inviters currently registered within this guild. </p>
                </div>

                {!config.enabled ? (
                    <div className="py-12 text-center border border-dashed border-neutral-200 dark:border-neutral-800 rounded-xl bg-neutral-50 dark:bg-zinc-900/20">
                        <p className="text-sm text-zinc-500">
                            Enable the tracking system above to display statistical data. </p>
                    </div>
                ) : leaderboard.length === 0 ? (
                    <div className="py-12 text-center">
                        <p className="text-sm text-zinc-500">No invitation logs recorded yet.</p>
                    </div>
                ) : (
                    <Table className="border-neutral-200 dark:border-neutral-800 bg-white dark:bg-zinc-900/10">
                        <TableHeader
                            headers={["Rank", "Inviter ID", "Invites"]}
                        />
                        <TableBody>
                            {leaderboard.map((entry, index) => {
                                const rank = index + 1;
                                return (
                                    <TableRow key={entry.inviterId}>
                                        <TableCell className="font-medium">
                                            {rank === 1 ? (
                                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold border border-amber-500/20">
                                                    1
                                                </span>
                                            ) : rank === 2 ? (
                                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-zinc-400/10 text-zinc-600 dark:text-zinc-300 text-xs font-bold border border-zinc-400/20">
                                                    2
                                                </span>
                                            ) : rank === 3 ? (
                                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-700/15 text-amber-800 dark:text-amber-600 text-xs font-bold border border-amber-700/20">
                                                    3
                                                </span>
                                            ) : (
                                                <span className="text-zinc-400 dark:text-zinc-500 pl-2 text-xs font-medium">
                                                    #{rank}
                                                </span>
                                            )}
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-neutral-800 dark:text-zinc-300">
                                            {entry.inviterId}
                                        </TableCell>
                                        <TableCell className="font-semibold text-neutral-900 dark:text-zinc-100">
                                            {entry.count.toLocaleString()}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                )}
            </div>

            {/* Unsaved Popup Notification */}
            {isDirty && (
                <SavePopup
                    handleCancel={handleCancel} handleSave={handleSave} isSaving={isPending}
                />
            )}
        </div>
    );
}