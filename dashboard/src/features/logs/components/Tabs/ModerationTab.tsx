"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/layout/Table";
import { ModerationLog } from "@/features/logs/types";
import { getModerationLogsAction } from "@/features/logs/actions";
import { cn } from "@/lib/cn";
import { TableSkeleton } from "@/features/logs/components/TableSkeleton";
import { EmptyLogsState } from "@/features/logs/components/EmptyLogState";

interface ModerationTabProps {
    guildId: string;
}

const LIMIT = 20;
const HEADERS = ["Case ID", "Action", "Target Username", "Moderator Username", "Reason", "Duration", "Timestamp"];

function InfiniteLoadingIndicator(props: {
    ref: React.RefObject<HTMLDivElement | null>,
    loadingMore: boolean,
    hasMore: boolean,
    logsLength: number
}) {
    return null;
}

export function ModerationTab({ guildId }: ModerationTabProps): ReactNode {
    const [logs, setLogs] = useState<ModerationLog[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [loadingMore, setLoadingMore] = useState<boolean>(false);
    const [hasMore, setHasMore] = useState<boolean>(true);

    const observerTarget = useRef<HTMLDivElement | null>(null);

    const lastLog = logs[logs.length - 1];
    const lastLogCreatedAt = lastLog?.created_at || null;
    const lastLogCaseId = lastLog?.case_id || null;

    useEffect(() => {
        setLoading(true);
        setHasMore(true);
        setLogs([]);

        getModerationLogsAction(guildId, LIMIT, null, null)
            .then((data) => {
                setLogs(data);
                if (data.length < LIMIT) setHasMore(false);
            })
            .catch((err) => console.error("Error fetching initial moderation logs:", err))
            .finally(() => setLoading(false));
    }, [guildId]);

    const fetchMoreLogs = useCallback(async () => {
        if (loading || loadingMore || !hasMore || !lastLogCreatedAt || !lastLogCaseId) return;

        setLoadingMore(true);
        try {
            const data = await getModerationLogsAction(guildId, LIMIT, lastLogCreatedAt, lastLogCaseId);
            if (data.length < LIMIT) setHasMore(false);
            setLogs((prev) => [...prev, ...data]);
        } catch (err) {
            console.error("Error loading more moderation logs:", err);
        } finally {
            setLoadingMore(false);
        }
    }, [guildId, lastLogCreatedAt, lastLogCaseId, loading, loadingMore, hasMore]);

    useEffect(() => {
        const target = observerTarget.current;
        if (!target || !hasMore || loading || loadingMore) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    fetchMoreLogs();
                }
            },
            { rootMargin: "200px" }
        );

        observer.observe(target);

        return () => {
            if (target) observer.unobserve(target);
        };
    }, [fetchMoreLogs, hasMore, loading, loadingMore]);

    if (loading) {
        return <TableSkeleton headers={HEADERS} />;
    }

    if (logs.length === 0) {
        return <EmptyLogsState message="No moderation incidents have been filed on this server." />;
    }

    const getActionBadgeColor = (action: string): string => {
        switch (action.toLowerCase()) {
            case "ban":
            case "softban":
                return "bg-danger-subtle text-danger border-danger/15";
            case "kick":
                return "bg-warning-subtle text-warning border-warning/15";
            case "mute":
                return "bg-warning-subtle text-warning border-warning/15";
            case "unmute":
                return "bg-success-subtle text-success border-success/15";
            default:
                return "bg-surface-active text-muted-foreground border-border";
        }
    };

    return (
        <div className="space-y-4">
            <Table>
                <TableHeader headers={HEADERS} />
                <TableBody>
                    {logs.map((log) => (
                        <TableRow key={log.case_id}>
                            <TableCell className="font-mono text-xs font-semibold text-foreground">
                                #{log.case_id}
                            </TableCell>
                            <TableCell>
                                <span
                                    className={cn(
                                        "px-2 py-0.5 text-xs font-bold uppercase tracking-wider rounded border",
                                        getActionBadgeColor(log.action_type)
                                    )}
                                >
                                    {log.action_type.toUpperCase()}
                                </span>
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                                {log.target_id ?? "—"}
                            </TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                                {log.moderator_id}
                            </TableCell>
                            <TableCell className="max-w-xs truncate text-foreground">
                                {log.reason || (
                                    <span className="text-muted-foreground italic">No reason provided</span>
                                )}
                            </TableCell>
                            <TableCell className="text-xs text-foreground">
                                {log.duration || <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                                {new Date(log.created_at).toLocaleString()}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            {/* Bottom Infinite Loading Indicator */}
            <InfiniteLoadingIndicator
                ref={observerTarget}
                loadingMore={loadingMore}
                hasMore={hasMore}
                logsLength={logs.length}
            />
        </div>
    );
}