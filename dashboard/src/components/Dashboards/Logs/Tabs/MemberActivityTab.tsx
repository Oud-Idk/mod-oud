"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getJoinLeaveLogs, JoinLeaveLog } from "@/actions/logs";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/Dashboards/Logs/Table";

interface MemberActivityTabProps {
    guildId: string;
}

const LIMIT = 20;

export function MemberActivityTab({ guildId }: MemberActivityTabProps) {
    const [logs, setLogs] = useState<JoinLeaveLog[]>([]);
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

        getJoinLeaveLogs(guildId, null, LIMIT, null, null)
            .then((data) => {
                setLogs(data);
                if (data.length < LIMIT) setHasMore(false);
            })
            .catch((err) => console.error("Error fetching initial activity logs:", err))
            .finally(() => setLoading(false));
    }, [guildId]);

    const fetchMoreLogs = useCallback(async () => {
        if (loading || loadingMore || !hasMore || !lastLogCreatedAt || !lastLogId) return;

        setLoadingMore(true);
        try {
            const data = await getJoinLeaveLogs(guildId, null, LIMIT, lastLogCreatedAt, lastLogId);
            if (data.length < LIMIT) setHasMore(false);
            setLogs((prev) => [...prev, ...data]);
        } catch (err) {
            console.error("Error loading more activity logs:", err);
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
        return <div>Loading member events...</div>;
    }

    if (logs.length === 0) {
        return <div>No entries found.</div>;
    }

    return (
        <div>
            <Table>
                <TableHeader headers={["User ID", "Action", "Timestamp"]}/>
                <TableBody>
                    {logs.map((log) => (
                        <TableRow key={log.id}>
                            <TableCell className="font-mono text-xs">{log.user_id}</TableCell>
                            <TableCell>
                                {log.action === "JOIN" ? (
                                    <span className="px-2 py-0.5 text-xs rounded bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                                        Joined
                                    </span>
                                ) : (
                                    <span className="px-2 py-0.5 text-xs rounded bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                        Left
                                    </span>
                                )}
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