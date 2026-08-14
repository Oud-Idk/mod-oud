"use client";

import { JSX, useCallback, useEffect, useRef, useState } from "react";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/layout/Table";
import { JoinLeaveLog } from "@/features/logs/types";
import { getJoinLeaveLogsAction } from "@/features/logs/actions";
import { TableSkeleton } from "@/features/logs/components/TableSkeleton";
import { EmptyLogsState } from "@/features/logs/components/EmptyLogState";
import { InfiniteLoadingIndicator } from "@/features/logs/components/InfiniteLoadingIndicator";

interface MemberActivityTabProps {
    guildId: string;
}

const LIMIT = 20;
const HEADERS = ["User ID", "Action", "Timestamp"];

export function MemberActivityTab({ guildId }: MemberActivityTabProps): JSX.Element {
    const [logs, setLogs] = useState<JoinLeaveLog[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [loadingMore, setLoadingMore] = useState<boolean>(false);
    const [hasMore, setHasMore] = useState<boolean>(true);

    const observerTarget = useRef<HTMLDivElement | null>(null);

    const lastLog: JoinLeaveLog | undefined = logs.length > 0 ? logs[logs.length - 1] : undefined;
    const lastLogCreatedAt = lastLog !== undefined ? lastLog.created_at : null;
    const lastLogId = lastLog !== undefined ? lastLog.id : null;

    useEffect(() => {
        setLoading(true);
        setHasMore(true);
        setLogs([]);

        void getJoinLeaveLogsAction(guildId, null, LIMIT, null, null)
            .then((data) => {
                setLogs(data);
                if (data.length < LIMIT) setHasMore(false);
            })
            .catch((err: unknown) => {
                console.error("Error fetching initial activity logs:", err);
            })
            .finally(() => {
                setLoading(false);
            });
    }, [guildId]);

    const fetchMoreLogs = useCallback(async (): Promise<void> => {
        if (
            loading ||
            loadingMore ||
            !hasMore ||
            lastLogCreatedAt === null ||
            lastLogId === null
        ) {
            return;
        }

        setLoadingMore(true);
        try {
            const data = await getJoinLeaveLogsAction(guildId, null, LIMIT, lastLogCreatedAt, lastLogId);
            if (data.length < LIMIT) setHasMore(false);
            setLogs((prev) => [...prev, ...data]);
        } catch (err: unknown) {
            console.error("Error loading more activity logs:", err);
        } finally {
            setLoadingMore(false);
        }
    }, [guildId, lastLogCreatedAt, lastLogId, loading, loadingMore, hasMore]);

    useEffect(() => {
        const target = observerTarget.current;
        if (target === null || !hasMore || loading || loadingMore) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting) {
                    void fetchMoreLogs();
                }
            },
            { rootMargin: "200px" }
        );

        observer.observe(target);

        return () => {
            observer.unobserve(target);
        };
    }, [fetchMoreLogs, hasMore, loading, loadingMore]);

    if (loading) {
        return <TableSkeleton headers={HEADERS} />;
    }

    if (logs.length === 0) {
        return <EmptyLogsState message="No member events (joins/leaves) have occurred recently." />;
    }

    return (
        <div className="space-y-4">
            <Table>
                <TableHeader headers={HEADERS} />
                <TableBody>
                    {logs.map((log) => (
                        <TableRow key={log.id}>
                            <TableCell className="font-mono text-xs text-muted-foreground">{log.user_id}</TableCell>
                            <TableCell>
                                {log.action === "JOIN" ? (
                                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-success-subtle text-success border border-success/15">
                                        Joined
                                    </span>
                                ) : (
                                    <span className="px-2 py-0.5 text-xs font-semibold rounded bg-warning-subtle text-warning border border-warning/15">
                                        Left
                                    </span>
                                )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
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