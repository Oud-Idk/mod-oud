"use client";

import { JSX, useCallback, useEffect, useRef, useState } from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/layout/Table";
import { AutomodLog } from "@/features/logs/types";
import { getAutomodLogsAction } from "@/features/logs/actions";
import { TableSkeleton } from "@/features/logs/components/TableSkeleton";
import { EmptyLogsState } from "@/features/logs/components/EmptyLogState";
import { InfiniteLoadingIndicator } from "@/features/logs/components/InfiniteLoadingIndicator";

interface AutomodTabProps {
    guildId: string;
}

const LIMIT = 20;
const HEADERS = ["User ID", "Rule Type", "Triggered By", "Original Content", "Actions Taken", "Timestamp"];

export function AutomodTab({ guildId }: AutomodTabProps): JSX.Element {
    const [logs, setLogs] = useState<AutomodLog[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [loadingMore, setLoadingMore] = useState<boolean>(false);
    const [hasMore, setHasMore] = useState<boolean>(true);

    const observerTarget = useRef<HTMLDivElement | null>(null);

    const lastLog = logs[logs.length - 1];
    const lastLogCreatedAt = lastLog?.created_at || null;
    const lastLogId = lastLog?.id || null;

    useEffect(() => {
        setLoading(true);
        setHasMore(true);
        setLogs([]);

        getAutomodLogsAction(guildId, LIMIT, null, null)
            .then((data) => {
                setLogs(data);
                if (data.length < LIMIT) setHasMore(false);
            })
            .catch((err) => console.error("Error fetching initial automod logs:", err))
            .finally(() => setLoading(false));
    }, [guildId]);

    const fetchMoreLogs = useCallback(async () => {
        if (loading || loadingMore || !hasMore || !lastLogCreatedAt || !lastLogId) return;

        setLoadingMore(true);
        try {
            const data = await getAutomodLogsAction(guildId, LIMIT, lastLogCreatedAt, lastLogId);
            if (data.length < LIMIT) setHasMore(false);
            setLogs((prev) => [...prev, ...data]);
        } catch (err) {
            console.error("Error loading more automod logs:", err);
        } finally {
            setLoadingMore(false);
        }
    }, [guildId, lastLogCreatedAt, lastLogId, loading, loadingMore, hasMore]);

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
        return <EmptyLogsState message="No Automod logs have been recorded on this server." />;
    }

    return (
        <div className="space-y-4">
            <Table>
                <TableHeader headers={HEADERS}/>
                <TableBody>
                    {logs.map((log) => (
                        <TableRow key={log.id}>
                            <TableCell className="font-mono text-xs">
                                {log.user_id}
                            </TableCell>
                            <TableCell className="font-semibold text-danger">
                                {log.rule_type}
                            </TableCell>
                            <TableCell className="max-w-xs truncate italic">
                                {log.trigger_content || "—"}
                            </TableCell>
                            <TableCell className="max-w-md truncate">
                                {log.original_content || "—"}
                            </TableCell>
                            <TableCell>
                                <div className="flex flex-wrap gap-1">
                                    {log.actions_taken.map((action, i) => (
                                        <span
                                            key={i}
                                            className="px-2 py-0.5 text-xs font-medium rounded border border-border bg-surface-muted"
                                        >
                                            {action}
                                        </span>
                                    ))}
                                </div>
                            </TableCell>
                            <TableCell>
                                {new Date(log.created_at).toLocaleString()}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <InfiniteLoadingIndicator
                ref={observerTarget}
                loadingMore={loadingMore}
                hasMore={hasMore}
                logsLength={logs.length}
            />
        </div>
    );
}