"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getModerationLogs, ModerationLog } from "@/actions/logs";
import { Table, TableBody, TableCell, TableHeader, TableRow } from "@/components/Table";

interface ModerationTabProps {
    guildId: string;
}

const LIMIT = 20;

export function ModerationTab({ guildId }: ModerationTabProps) {
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

        getModerationLogs(guildId, LIMIT, null, null)
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
            const data = await getModerationLogs(guildId, LIMIT, lastLogCreatedAt, lastLogCaseId);
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
        return <div>Loading logs...</div>;
    }

    if (logs.length === 0) {
        return <div>No moderation logs found.</div>;
    }

    // Small helper to color code the action badges so it looks fancy
    const getActionBadgeColor = (action: string) => {
        switch (action.toLowerCase()) {
            case "ban":
            case "softban":
                return "bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20";
            case "kick":
                return "bg-orange-500/10 text-orange-500 dark:text-orange-400 border-orange-500/20";
            case "mute":
                return "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20";
            case "unmute":
                return "bg-green-500/10 text-green-500 dark:text-green-400 border-green-500/20";
            default:
                return "bg-neutral-500/10 text-neutral-500 dark:text-neutral-400 border-neutral-500/20";
        }
    };

    return (
        <div>
            <Table>
                <TableHeader
                    headers={["Case ID", "Action", "Target Username", "Moderator Username", "Reason", "Duration", "Timestamp"]}
                />
                <TableBody>
                    {logs.map((log) => (
                        <TableRow key={log.case_id}>
                            <TableCell className="font-mono text-xs font-semibold">#{log.case_id}</TableCell>
                            <TableCell>
                                <span
                                    className={`px-2 py-0.5 text-xs rounded border ${getActionBadgeColor(log.action_type)}`}
                                >
                                    {log.action_type.toUpperCase()}
                                </span>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{log.target_username ?? "-"}</TableCell>
                            <TableCell className="font-mono text-xs">{log.moderator_username}</TableCell>
                            <TableCell className="max-w-xs truncate">
                                {log.reason || <span className="text-gray-400 italic">No reason provided</span>}
                            </TableCell>
                            <TableCell className="text-xs">
                                {log.duration || <span className="text-gray-400">—</span>}
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