import { useCallback, useEffect, useRef, useState } from "react";

export interface UseMessageLogViewerProps<T> {
    sseUrl: string;
    initialHistory?: T[];
    guildId: string;
    fetchMoreAction: (guild_id: string, before_id: number) => Promise<T[]>;
    eventName: string;
}

export function useSSEInfiniteScroll<T extends { id: number }>({
    sseUrl,
    initialHistory = [],
    guildId,
    fetchMoreAction,
    eventName,
}: UseMessageLogViewerProps<T>) {
    const [logs, setLogs] = useState<T[]>(initialHistory);
    const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
    const [hasMore, setHasMore] = useState(initialHistory.length >= 10);
    const [isLoadingMore, setIsLoadingMore] = useState(false);

    const observerTarget = useRef<HTMLDivElement | null>(null);

    const loadMoreLogs = useCallback(async () => {
        if (isLoadingMore || !hasMore || logs.length === 0) return;

        setIsLoadingMore(true);
        const oldestLog = logs[logs.length - 1];
        if (!oldestLog) {
            setIsLoadingMore(false);
            return;
        }

        try {
            const olderLogs = await fetchMoreAction(guildId, oldestLog.id);
            const safeOlderLogs = olderLogs || [];

            if (safeOlderLogs.length < 10) {
                setHasMore(false);
            }

            if (safeOlderLogs.length > 0) {
                setLogs((prev) => {
                    const existingIds = new Set(prev.map((l) => l.id));
                    const filteredNewLogs = safeOlderLogs.filter((l) => !existingIds.has(l.id));
                    return [...prev, ...filteredNewLogs];
                });
            }
        } catch (err) {
            console.error(`Error loading more ${eventName} logs:`, err);
        } finally {
            setIsLoadingMore(false);
        }
    }, [guildId, hasMore, isLoadingMore, logs, fetchMoreAction, eventName]);

    // Setup intersection observer
    useEffect(() => {
        const target = observerTarget.current;
        if (!target) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && hasMore) {
                    loadMoreLogs();
                }
            },
            { threshold: 0.1 }
        );

        observer.observe(target);

        return () => {
            if (target) observer.unobserve(target);
        };
    }, [loadMoreLogs, hasMore]);

    // Setup SSE connection
    useEffect(() => {
        const eventSource = new EventSource(sseUrl);

        eventSource.onopen = () => {
            setStatus("connected");
        };

        const handleEvent = (event: MessageEvent) => {
            try {
                const parsed = JSON.parse(event.data);
                console.log(`[Browser SSE] Received event:`, parsed); // <-- Add this logger

                setLogs((prev) => {
                    const exists = prev.some((log) => log.id === parsed.id);
                    if (exists) {
                        // Overwrite existing properties by spreading parsed over log
                        return prev.map((log) => {
                            if (log.id === parsed.id) {
                                return {
                                    ...log,
                                    ...parsed,
                                } as T;
                            }
                            return log;
                        });
                    } else {
                        // Build complete structure for brand new events
                        const data: T = {
                            id: parsed.id || Date.now(),
                            guild_id: parsed.guild_id || guildId,
                            channel_id: parsed.channel_id,
                            message_id: parsed.message_id,
                            author_id: parsed.author_id,
                            reporter_id: parsed.reporter_id,
                            message_content: parsed.content || parsed.message_content,
                            attachment_url: parsed.attachment_url || null,
                            reason: parsed.reason,
                            status: parsed.status || 'under_review',
                            created_at: parsed.created_at || new Date().toISOString(),
                            ...parsed
                        } as T;
                        return [data, ...prev];
                    }
                });
            } catch (err) {
                console.error(`Error parsing ${eventName} SSE event:`, err);
            }
        };
        eventSource.addEventListener(eventName, handleEvent);

        eventSource.onerror = (err) => {
            console.error(`SSE ${eventName} channel error:`, err);
            setStatus("disconnected");
        };

        return () => {
            eventSource.removeEventListener(eventName, handleEvent);
            eventSource.close();
        };
    }, [sseUrl, eventName]);

    return {
        logs,
        status,
        hasMore,
        isLoadingMore,
        observerTarget,
    };
}

