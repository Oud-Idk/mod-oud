import {
    type Dispatch,
    type RefObject,
    type SetStateAction,
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";
import { z } from "zod";
import { config } from "@/config";
import { issueRealtimeTicketAction } from "@/features/realtime/actions";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface NowPlayingData {
    title: string;
    thumbnail?: string;
    requestedBy?: string;
    durationSec?: number;
    positionSec?: number;
    isPaused?: boolean;
    isLive?: boolean;
}

interface PendingRequest {
    resolve: (data: unknown) => void;
    reject: (reason: Error) => void;
    timeoutId: ReturnType<typeof setTimeout>;
}

const ackSchema = z.object({
    type: z.literal("ack"),
    requestId: z.string().optional(),
    ok: z.boolean(),
    error: z.string().optional(),
    data: z.unknown().optional(),
});

const eventSchema = z.object({
    type: z.literal("event"),
    event: z.string(),
    data: z.unknown().optional(),
});

const durationObjectSchema = z.object({
    secs: z.number().optional(),
    seconds: z.number().optional(),
    duration: z.number().optional(),
});

const durationSchema = z.union([z.number(), z.string(), durationObjectSchema, z.null()]).optional();
const requesterSchema = z.union([z.string(), z.looseObject({ name: z.string() })]).optional();

const nowPlayingPayloadSchema = z.object({
    title: z.string().optional(),
    thumbnail: z.string().optional(),
    requested_by: requesterSchema,
    requestedBy: requesterSchema,
    duration: durationSchema,
    durationSec: durationSchema,
    position_sec: z.number().optional(),
    positionSec: z.number().optional(),
    is_paused: z.boolean().optional(),
    isPaused: z.boolean().optional(),
    is_live: z.boolean().optional(),
    isLive: z.boolean().optional(),
    metadata: z.object({
        title: z.string().optional(),
        thumbnail: z.string().optional(),
        duration: durationSchema,
        durationSec: durationSchema,
    }).optional(),
});

const noop = (_err?: unknown): void => {
    // Silently ignored background handler
};

async function wsUrlWithTicket(guildId: string): Promise<string> {
    const base = config.publicBackendUrl.replace(/^http/, "ws");
    const ticket = await issueRealtimeTicketAction(guildId, "ws");
    const params = new URLSearchParams({
        guild_id: guildId,
        user_id: ticket.userId,
        expires: String(ticket.expires),
        sig: ticket.sig,
    });
    return `${base}/api/ws/control?${params.toString()}`;
}

function parseRequester(raw: unknown): string | undefined {
    if (typeof raw === "string") return raw;
    if (typeof raw === "object" && raw !== null && "name" in raw && typeof raw.name === "string") {
        return raw.name;
    }
    return undefined;
}

function parseDuration(raw: unknown): number {
    if (typeof raw === "number") return raw;
    if (raw === null) return 0;
    if (typeof raw === "string") {
        const parsed = Number.parseFloat(raw);
        if (!Number.isNaN(parsed)) return parsed;
    }
    const parseResult = durationObjectSchema.safeParse(raw);
    if (parseResult.success) {
        const { secs, seconds, duration } = parseResult.data;
        if (typeof secs === "number") return secs;
        if (typeof seconds === "number") return seconds;
        if (typeof duration === "number") return duration;
    }
    return 0;
}

export interface UseMusicConnectionReturn {
    status: ConnectionStatus;
    nowPlaying: NowPlayingData | null;
    position: number;
    duration: number;
    isPaused: boolean;
    isSeeking: boolean;
    activeRequestsCount: number;
    feedback: { ok: boolean; text: string } | null;
    setFeedback: Dispatch<SetStateAction<{ ok: boolean; text: string } | null>>;
    setNowPlaying: Dispatch<SetStateAction<NowPlayingData | null>>;
    setDuration: Dispatch<SetStateAction<number>>;
    sendCommand: (action: string, payload?: Record<string, unknown>) => Promise<unknown>;
    showFeedback: (ok: boolean, text: string, autoDismissMs?: number) => void;
    setPosition: Dispatch<SetStateAction<number>>;
    setIsPaused: Dispatch<SetStateAction<boolean>>;
    setIsSeeking: Dispatch<SetStateAction<boolean>>;
    playheadAnchorRef: RefObject<{ basePos: number; timestamp: number } | null>;
    isMountedRef: RefObject<boolean>;
}

// Socket lifecycle, command dispatch, and playback clock. The panel stays a
// thin action + render layer over this state.
export function useMusicConnection({ guildId }: { guildId: string }): UseMusicConnectionReturn {
    const [status, setStatus] = useState<ConnectionStatus>("connecting");
    const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
    const [activeRequestsCount, setActiveRequestsCount] = useState<number>(0);

    const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null);
    const [position, setPosition] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);
    const [isSeeking, setIsSeeking] = useState<boolean>(false);
    const [isPaused, setIsPaused] = useState<boolean>(false);

    // References for clean state management across socket callbacks & timers
    const isMountedRef = useRef<boolean>(true);
    const socketRef = useRef<WebSocket | null>(null);
    const pendingRequestsRef = useRef<Map<string, PendingRequest>>(new Map());
    const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Anchor time ref for high-precision playhead time calculations without drift
    const playheadAnchorRef = useRef<{ basePos: number; timestamp: number } | null>(null);

    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    // Display localized feedback with optional auto-dismiss
    const showFeedback = useCallback((ok: boolean, text: string, autoDismissMs = 5000): void => {
        if (!isMountedRef.current) return;
        setFeedback({ ok, text });
        if (feedbackTimerRef.current !== null) clearTimeout(feedbackTimerRef.current);
        if (autoDismissMs > 0) {
            feedbackTimerRef.current = setTimeout(() => {
                if (isMountedRef.current) setFeedback(null);
            }, autoDismissMs);
        }
    }, []);

    const updateNowPlayingState = useCallback((data: unknown): void => {
        if (!isMountedRef.current) return;

        const parseResult = nowPlayingPayloadSchema.safeParse(data);
        if (!parseResult.success) {
            setNowPlaying(null);
            setPosition(0);
            setDuration(0);
            playheadAnchorRef.current = null;
            return;
        }

        const item = parseResult.data;
        const title = item.metadata?.title ?? item.title;

        if (title !== undefined && title.length > 0) {
            const rawDuration = item.metadata?.duration ?? item.metadata?.durationSec ?? item.duration ?? item.durationSec;
            const newDuration = parseDuration(rawDuration);
            const livePosition = item.position_sec ?? item.positionSec ?? 0;
            const pausedState = item.is_paused ?? item.isPaused ?? false;
            const liveState = item.is_live ?? item.isLive ?? false;

            setIsPaused(pausedState);

            setNowPlaying((prev) => ({
                title,
                thumbnail: item.metadata?.thumbnail ?? item.thumbnail ?? prev?.thumbnail,
                requestedBy: parseRequester(item.requested_by) ?? parseRequester(item.requestedBy) ?? prev?.requestedBy ?? "Web",
                durationSec: newDuration > 0 ? newDuration : prev?.durationSec,
                positionSec: livePosition,
                isPaused: pausedState,
                isLive: liveState,
            }));

            setDuration(newDuration);
            if (!isSeeking) {
                setPosition(Math.round(livePosition));
                playheadAnchorRef.current = {
                    basePos: livePosition,
                    timestamp: performance.now(),
                };
            }
        } else {
            setNowPlaying(null);
            setPosition(0);
            setDuration(0);
            playheadAnchorRef.current = null;
        }
    }, [isSeeking]);

    const updateNowPlayingStateRef = useRef(updateNowPlayingState);
    useEffect(() => {
        updateNowPlayingStateRef.current = updateNowPlayingState;
    }, [updateNowPlayingState]);

    // Command Dispatcher with Promise tracking & timeout
    const sendCommand = useCallback(
        (action: string, payload?: Record<string, unknown>): Promise<unknown> => {
            return new Promise((resolve, reject) => {
                const socket = socketRef.current;
                if (socket === null || socket.readyState !== WebSocket.OPEN) {
                    const err = "Not connected to the bot.";
                    showFeedback(false, err);
                    reject(new Error(err));
                    return;
                }

                const requestId = crypto.randomUUID();

                setActiveRequestsCount((c) => c + 1);

                const timeoutId = setTimeout(() => {
                    if (pendingRequestsRef.current.has(requestId)) {
                        pendingRequestsRef.current.delete(requestId);
                        if (isMountedRef.current) {
                            setActiveRequestsCount((c) => Math.max(0, c - 1));
                            showFeedback(false, `Command "${action}" timed out.`);
                        }
                        reject(new Error("Command timed out."));
                    }
                }, 10000);

                pendingRequestsRef.current.set(requestId, { resolve, reject, timeoutId });

                const message = { type: "music", requestId, action, ...payload };
                try {
                    socket.send(JSON.stringify(message));
                } catch (e: unknown) {
                    clearTimeout(timeoutId);
                    pendingRequestsRef.current.delete(requestId);
                    setActiveRequestsCount((c) => Math.max(0, c - 1));
                    const err = "Failed to transmit frame to server.";
                    showFeedback(false, err);
                    reject(e instanceof Error ? e : new Error(typeof e === "string" ? e : err));
                }
            });
        },
        [showFeedback]
    );

    const sendCommandRef = useRef(sendCommand);
    useEffect(() => {
        sendCommandRef.current = sendCommand;
    }, [sendCommand]);

    // Central Incoming WebSocket Message Dispatcher
    const handleIncomingFrame = useCallback((event: MessageEvent): void => {
        try {
            const raw: unknown = JSON.parse(String(event.data));

            // 1. Handle command execution ACKs
            const ackResult = ackSchema.safeParse(raw);
            if (ackResult.success) {
                const { requestId, ok, error, data } = ackResult.data;
                if (requestId !== undefined && requestId.length > 0) {
                    const pending = pendingRequestsRef.current.get(requestId);
                    if (pending !== undefined) {
                        clearTimeout(pending.timeoutId);
                        pendingRequestsRef.current.delete(requestId);

                        if (isMountedRef.current) {
                            setActiveRequestsCount((c) => Math.max(0, c - 1));
                        }

                        if (ok) {
                            pending.resolve(data);
                        } else {
                            const errMsg = error ?? "Command failed.";
                            if (isMountedRef.current) showFeedback(false, errMsg);
                            pending.reject(new Error(errMsg));
                        }
                    }
                }
                return;
            }

            // 2. Handle server push events
            const eventResult = eventSchema.safeParse(raw);
            if (eventResult.success) {
                if (eventResult.data.event === "nowPlaying") {
                    updateNowPlayingStateRef.current(eventResult.data.data);
                }
            }
        } catch {
            // Ignore non-JSON frames
        }
    }, [showFeedback]);

    // WebSocket Lifecycle Management with Exponential Backoff
    useEffect(() => {
        let socket: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let backoffMs = 1000;

        const rejectAllPending = (reason: string): void => {
            pendingRequestsRef.current.forEach((req) => {
                clearTimeout(req.timeoutId);
                req.reject(new Error(reason));
            });
            pendingRequestsRef.current.clear();
            if (isMountedRef.current) {
                setActiveRequestsCount(0);
            }
        };

        const connect = (): void => {
            if (!isMountedRef.current) return;

            setStatus("connecting");
            // Ticket is signed server-side; never expose INTERNAL_API_SECRET to the browser.
            void wsUrlWithTicket(guildId).then((url) => {
                if (!isMountedRef.current) return;
                socket = new WebSocket(url);
                socketRef.current = socket;

                socket.onopen = (): void => {
                    if (!isMountedRef.current) return;
                    backoffMs = 1000;
                    setStatus("connected");
                    sendCommandRef.current("nowPlaying")
                        .then((data) => {
                            updateNowPlayingStateRef.current(data);
                        })
                        .catch(noop);
                };

                socket.onmessage = (event: MessageEvent): void => {
                    handleIncomingFrame(event);
                };

                socket.onclose = (): void => {
                    rejectAllPending("Connection closed.");
                    if (!isMountedRef.current) return;
                    setStatus("disconnected");
                    reconnectTimer = setTimeout(connect, backoffMs);
                    backoffMs = Math.min(backoffMs * 2, 16000);
                };

                socket.onerror = (): void => {
                    socket?.close();
                };
            }).catch((err: unknown) => {
                console.error("Failed to obtain WS ticket:", err);
                setStatus("disconnected");
                reconnectTimer = setTimeout(connect, backoffMs);
                backoffMs = Math.min(backoffMs * 2, 16000);
            });
            return;
        };

        connect();

        return () => {
            rejectAllPending("Component unmounted.");
            if (reconnectTimer !== null) clearTimeout(reconnectTimer);
            if (socket !== null) {
                socket.onclose = null; // Prevent reconnect on explicit teardown
                socket.close();
            }
            socketRef.current = null;
        };
    }, [guildId, handleIncomingFrame]);

    // Periodic now-playing heartbeat: resyncs live state with the bot every 5s
    useEffect(() => {
        if (status !== "connected") return;
        const heartbeat = setInterval(() => {
            sendCommandRef.current("nowPlaying")
                .then((data) => {
                    updateNowPlayingStateRef.current(data);
                })
                .catch(noop);
        }, 5000);
        return () => {
            clearInterval(heartbeat);
        };
    }, [status]);

    // Drift-Free Audio Position Playhead Engine
    useEffect(() => {
        if (status !== "connected" || isPaused || isSeeking || nowPlaying === null) return;
        if (nowPlaying.isLive === true) return;

        const interval = setInterval(() => {
            if (playheadAnchorRef.current === null) return;

            const elapsedSec = (performance.now() - playheadAnchorRef.current.timestamp) / 1000;
            const currentComputed = Math.floor(playheadAnchorRef.current.basePos + elapsedSec);

            if (duration > 0 && currentComputed >= duration) {
                setPosition(duration);
                clearInterval(interval);
                void sendCommandRef.current("nowPlaying").catch(noop);
                return;
            }

            setPosition(currentComputed);
        }, 500);

        return () => {
            clearInterval(interval);
        };
    }, [status, isPaused, isSeeking, nowPlaying, duration]);

    return {
        status,
        nowPlaying,
        position,
        duration,
        isPaused,
        isSeeking,
        activeRequestsCount,
        feedback,
        setFeedback,
        setNowPlaying,
        setDuration,
        sendCommand,
        showFeedback,
        setPosition,
        setIsPaused,
        setIsSeeking,
        playheadAnchorRef,
        isMountedRef,
    };
}
