"use client";

import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/layout/Table";
import { AutomodLog } from "@/features/logs/types";
import { getAutomodLogsAction } from "@/features/logs/actions";

interface AutomodTabProps {
    guildId: string;
}

const LIMIT = 20;

export function AutomodTab({ guildId }: AutomodTabProps): ReactNode {
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
        return <div>Loading logs...</div>;
    }

    if (logs.length === 0) {
        return <div>No automod logs found.</div>;
    }

    return (
        <div>
            <Table>
                <TableHeader headers={["User ID", "Rule Type", "Triggered By", "Original Content", "Actions Taken", "Timestamp"]}/>
                <TableBody>
                    {logs.map((log) => (
                        <TableRow key={log.id}>
                            <TableCell className="font-mono text-xs">{log.user_id}</TableCell>
                            <TableCell>
                                <span className="dark:text-red-300 text-red-700">{log.rule_type}</span>
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
                                            className="px-2 py-0.5 text-xs rounded border-neutral-200 dark:border-neutral-700 border dark:text-gray-300"
                                        >
                                            {action}
                                        </span>
                                    ))}
                                </div>
                            </TableCell>
                            <TableCell className="text-xs">
                                {new Date(log.created_at).toLocaleString()}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>

            <div ref={observerTarget} className="py-6 flex justify-center items-center min-h-10">
                {loadingMore && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">Loading more logs...</span>
                )}
                {!hasMore && logs.length > 0 && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">All logs loaded</span>
                )}
            </div>
        </div>
    );
}