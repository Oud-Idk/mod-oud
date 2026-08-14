import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";

export type ConnectingStatus = "CONNECTING" | "CONNECTED" | "DISCONNECTED";

export const sseLogPayloadSchema = z
    .object({
        id: z.number().optional(),
        guild_id: z.string().optional(),
        channel_id: z.string().optional(),
        message_id: z.string().optional(),
        author_id: z.string().optional(),
        reporter_id: z.string().optional(),
        content: z.string().optional(),
        message_content: z.string().optional(),
        attachment_url: z.string().nullable().optional(),
        reason: z.string().optional(),
        status: z.string().optional(),
        created_at: z.string().optional(),
    })
    .loose();

export type SSELogPayload = z.infer<typeof sseLogPayloadSchema>;

export interface UseMessageLogViewerProps<T> {
    sseUrl: string;
    initialHistory?: T[];
    guildId: string;
    fetchMoreAction: (guild_id: string, before_id: number) => Promise<T[]>;
    eventName: string;
}

export interface UseSSEInfiniteScrollReturn<T> {
    logs: T[];
    status: ConnectingStatus;
    hasMore: boolean;
    isLoadingMore: boolean;
    observerTarget: RefObject<HTMLDivElement | null>;
}

export function useSSEInfiniteScroll<T extends { id: number }>({
    sseUrl,
    initialHistory = [],
    guildId,
    fetchMoreAction,
    eventName,
}: UseMessageLogViewerProps<T>): UseSSEInfiniteScrollReturn<T> {
    const [logs, setLogs] = useState<T[]>(initialHistory);
    const [status, setStatus] = useState<ConnectingStatus>("CONNECTING");
    const [hasMore, setHasMore] = useState<boolean>(initialHistory.length >= 10);
    const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);

    const observerTarget = useRef<HTMLDivElement | null>(null);

    const loadMoreLogs = useCallback(async (): Promise<void> => {
        if (isLoadingMore || !hasMore || logs.length === 0) return;

        const oldestLog = logs[logs.length - 1];

        setIsLoadingMore(true);

        try {
            const olderLogs = await fetchMoreAction(guildId, oldestLog.id);

            if (olderLogs.length < 10) {
                setHasMore(false);
            }

            if (olderLogs.length > 0) {
                setLogs((prev) => {
                    const existingIds = new Set(prev.map((l) => l.id));
                    const filteredNewLogs = olderLogs.filter((l) => !existingIds.has(l.id));
                    return [...prev, ...filteredNewLogs];
                });
            }
        } catch (err: unknown) {
            console.error(`Error loading more ${eventName} logs:`, err);
        } finally {
            setIsLoadingMore(false);
        }
    }, [guildId, hasMore, isLoadingMore, logs, fetchMoreAction, eventName]);

    // Setup intersection observer
    useEffect(() => {
        const target = observerTarget.current;
        if (target === null) return;

        const observer = new IntersectionObserver(
            (entries) => {
                const entry = entries[0];
                if (entry.isIntersecting && hasMore) {
                    void loadMoreLogs();
                }
            },
            { threshold: 0.1 }
        );

        observer.observe(target);

        return () => {
            observer.unobserve(target);
        };
    }, [loadMoreLogs, hasMore]);

    // Setup SSE connection
    useEffect(() => {
        const eventSource = new EventSource(sseUrl);

        eventSource.onopen = (): void => {
            setStatus("CONNECTED");
        };

        const itemSchema = z.custom<T>(
            (val): val is T =>
                typeof val === "object" &&
                val !== null &&
                "id" in val &&
                typeof val.id === "number"
        );

        const handleEvent = (event: Event): void => {
            if (!(event instanceof MessageEvent)) return;
            if (typeof event.data !== "string") return;

            try {
                const rawData: unknown = JSON.parse(event.data);
                const parseResult = sseLogPayloadSchema.safeParse(rawData);
                if (!parseResult.success) {
                    console.error(`Invalid SSE payload for ${eventName}:`, parseResult.error);
                    return;
                }

                const parsed = parseResult.data;
                console.log(`[Browser SSE] Received event:`, parsed);

                const eventId = parsed.id ?? Date.now();

                setLogs((prev) => {
                    const exists = prev.some((log) => log.id === eventId);
                    if (exists) {
                        return prev.map((log) => {
                            if (log.id === eventId) {
                                const merged = {
                                    ...log,
                                    ...parsed,
                                    id: eventId,
                                };
                                const validatedMerged = itemSchema.safeParse(merged);
                                return validatedMerged.success ? validatedMerged.data : log;
                            }
                            return log;
                        });
                    }

                    const newEntry = {
                        id: eventId,
                        guild_id: parsed.guild_id ?? guildId,
                        channel_id: parsed.channel_id,
                        message_id: parsed.message_id,
                        author_id: parsed.author_id,
                        reporter_id: parsed.reporter_id,
                        message_content: parsed.content ?? parsed.message_content,
                        attachment_url: parsed.attachment_url ?? null,
                        reason: parsed.reason,
                        status: parsed.status ?? "UNDER_REVIEW",
                        created_at: parsed.created_at ?? new Date().toISOString(),
                        ...parsed,
                    };

                    const validatedNewEntry = itemSchema.safeParse(newEntry);
                    return validatedNewEntry.success ? [validatedNewEntry.data, ...prev] : prev;
                });
            } catch (err: unknown) {
                console.error(`Error parsing ${eventName} SSE event:`, err);
            }
        };

        eventSource.addEventListener(eventName, handleEvent);

        eventSource.onerror = (err: Event): void => {
            console.error(`SSE ${eventName} channel error:`, err);
            setStatus("DISCONNECTED");
        };

        return () => {
            eventSource.removeEventListener(eventName, handleEvent);
            eventSource.close();
        };
    }, [sseUrl, eventName, guildId]);

    return {
        logs,
        status,
        hasMore,
        isLoadingMore,
        observerTarget,
    };
}