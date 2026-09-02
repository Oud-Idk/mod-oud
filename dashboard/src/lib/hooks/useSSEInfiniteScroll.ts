import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { config } from "@/config";
import { issueRealtimeTicketAction } from "@/features/realtime/actions";

export type ConnectingStatus = "CONNECTING" | "CONNECTED" | "DISCONNECTED";

export const sseLogPayloadSchema = z
    .object({
        id: z.union([z.number(), z.string()]).optional(),
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

    function isLogItem(item: unknown): item is T {
        return typeof item === "object" && item !== null;
    }

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

    // Setup intersection observer for infinite scroll
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

    // Ticket-aware SSE connection lifecycle
    useEffect(() => {
        let isMounted = true;
        let eventSource: EventSource | null = null;

        const connect = async (): Promise<void> => {
            try {
                setStatus("CONNECTING");

                // Request signed ticket from server action
                const ticket = await issueRealtimeTicketAction(guildId, "sse");
                if (!isMounted) return;

                // Build target URL cleanly using standard URL constructor
                const url = new URL("/api/sse/events", config.publicBackendUrl);
                url.searchParams.set("guild_id", guildId);
                url.searchParams.set("user_id", ticket.userId);
                url.searchParams.set("expires", String(ticket.expires));
                url.searchParams.set("sig", ticket.sig);

                eventSource = new EventSource(url.toString());

                eventSource.onopen = (): void => {
                    if (isMounted) setStatus("CONNECTED");
                };

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

                        // Coerce id to number if T extends { id: number }, or fallback to timestamp
                        const rawId = parsed.id;
                        const numericId = typeof rawId === "string" ? Number(rawId) : rawId;
                        const eventId = (numericId !== undefined && !Number.isNaN(numericId)) ? numericId : Date.now();

                        setLogs((prev: T[]): T[] => {
                            const exists = prev.some((log) => log.id === eventId);
                            if (exists) {
                                return prev.map((log): T => {
                                    if (log.id === eventId) {
                                        const merged = {
                                            ...log,
                                            ...parsed,
                                            id: eventId,
                                        };
                                        if (isLogItem(merged)) {
                                            return merged;
                                        }
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

                            if (isLogItem(newEntry)) {
                                return [newEntry, ...prev];
                            }

                            return prev;
                        });
                    } catch (err: unknown) {
                        console.error(`Error parsing ${eventName} SSE event:`, err);
                    }
                };

                eventSource.addEventListener(eventName, handleEvent);

                eventSource.onerror = (err: Event): void => {
                    console.error(`SSE ${eventName} channel error:`, err);
                    if (isMounted) setStatus("DISCONNECTED");
                };
            } catch (err: unknown) {
                console.error(`Failed to initialize SSE connection for ${eventName}:`, err);
                if (isMounted) setStatus("DISCONNECTED");
            }
        };

        void connect();

        return () => {
            isMounted = false;
            if (eventSource) {
                eventSource.close();
            }
        };
    }, [guildId, eventName]);

    return {
        logs,
        status,
        hasMore,
        isLoadingMore,
        observerTarget,
    };
}