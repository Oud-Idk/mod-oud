"use client";

import React, { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ToggleSwitch } from "@/components/ui/ToggleSwitch";
import { SavePopup } from "@/components/dashboard/SavePopup";
import { useConfigForm } from "@/components/dashboard/useConfigForm";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/layout/Table";
import { InviteTrackerConfig, LeaderboardEntry, inviteTrackerConfigSchema } from "@/features/invite-tracking/types";
import { fetchInviteLeaderboardAction } from "@/features/invite-tracking/actions";
import Emphasis from "@/components/layout/Emphasis";
import { toast } from "sonner";

interface InviteTrackerBodyProps {
    guildId: string;
    initialConfig: InviteTrackerConfig;
    initialLeaderboard: LeaderboardEntry[];
    pageSize?: number;
    onSave: (config: InviteTrackerConfig) => Promise<void>;
}

export function InviteTrackingBody({
    guildId,
    initialConfig,
    initialLeaderboard,
    pageSize = 15,
    onSave,
}: InviteTrackerBodyProps): ReactNode {
    const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>(initialLeaderboard);
    const [hasMore, setHasMore] = useState<boolean>(initialLeaderboard.length >= pageSize);
    const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

    // Observer sentinel reference
    const sentinelRef = useRef<HTMLDivElement | null>(null);

    const {
        config,
        setConfig,
        isPending,
        isDirty,
        resetKey,
        handleSave: originalHandleSave,
        handleCancel,
    } = useConfigForm({
        initialConfig,
        onSave,
    });

    const handleSave = useCallback(async () => {
        const validation = inviteTrackerConfigSchema.safeParse(config);
        if (!validation.success) {
            toast.error(validation.error.issues[0]?.message || "Invalid configuration");
            return;
        }
        await originalHandleSave();
    }, [config, originalHandleSave]);

    const handleToggle = useCallback((checked: boolean): void => {
        setConfig((prev) => ({ ...prev, enabled: checked }));
    }, [setConfig]);

    // Load next batch of leaderboard items
    const loadMore = useCallback(async () => {
        if (isLoadingMore || !hasMore || !config.enabled) return;

        setIsLoadingMore(true);
        try {
            const nextOffset = leaderboard.length;
            const newEntries = await fetchInviteLeaderboardAction(guildId, nextOffset, pageSize);

            if (newEntries.length < pageSize) {
                setHasMore(false);
            }

            if (newEntries.length > 0) {
                setLeaderboard((prev) => [...prev, ...newEntries]);
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Error loading more leaderboard entries");
        } finally {
            setIsLoadingMore(false);
        }
    }, [isLoadingMore, hasMore, config.enabled, leaderboard.length, guildId, pageSize]);

    // IntersectionObserver setup for infinite scroll
    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    loadMore();
                }
            },
            { threshold: 0.5 }
        );

        const currentSentinel = sentinelRef.current;
        if (currentSentinel) {
            observer.observe(currentSentinel);
        }

        return () => {
            if (currentSentinel) {
                observer.unobserve(currentSentinel);
            }
        };
    }, [loadMore]);

    const renderRankBadge = (rank: number) => {
        if (rank === 1) {
            return (
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-warning-subtle text-warning text-xs font-bold border border-warning/30">
                    1
                </span>
            );
        }
        if (rank === 2) {
            return (
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-surface-active text-foreground text-xs font-bold border border-border">
                    2
                </span>
            );
        }
        if (rank === 3) {
            return (
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-accent-subtle text-accent text-xs font-bold border border-accent/30">
                    3
                </span>
            );
        }
        return (
            <span className="text-muted-foreground text-xs font-medium pl-1.5">
                #{rank}
            </span>
        );
    };

    return (
        <div className="flex-1">
            <ToggleSwitch
                checked={config.enabled}
                onChange={handleToggle}
                disabled={isPending}
                text="Enable Tracking"
            />

            {config.enabled && (
                <>
                    <Emphasis className="mb-2">Invite Leaderboard</Emphasis>

                    {leaderboard.length === 0 ? (
                        <div className="py-12 text-center border border-dashed border-border-subtle rounded-xl bg-surface">
                            <p className="text-sm text-muted-foreground">No invitation logs recorded yet.</p>
                        </div>
                    ) : (
                        <>
                            <Table className="border border-border bg-surface rounded-lg overflow-hidden">
                                <TableHeader headers={["Rank", "Inviter ID", "Invites"]}/>
                                <TableBody>
                                    {leaderboard.map((entry, index) => {
                                        const rank = index + 1;
                                        return (
                                            <TableRow key={entry.inviterId}>
                                                <TableCell className="font-medium">
                                                    {renderRankBadge(rank)}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-foreground">
                                                    {entry.inviterId}
                                                </TableCell>
                                                <TableCell className="font-semibold text-foreground">
                                                    {entry.count.toLocaleString()}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                            <div ref={sentinelRef} className="py-3 text-center text-xs text-muted-foreground">
                                {isLoadingMore && <p>Loading more entries...</p>}
                                {!hasMore && leaderboard.length > pageSize && (
                                    <p>Reached end of leaderboard.</p>
                                )}
                            </div>
                        </>
                    )}
                </>
            )}

            {/* Unsaved Popup Notification */}
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