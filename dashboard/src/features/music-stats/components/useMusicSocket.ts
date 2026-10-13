import {
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type RefObject,
    type SetStateAction,
} from "react";
import {
    ackSchema,
    eventSchema,
    noop,
    wsUrlWithTicket,
    type ConnectionStatus,
    type PendingRequest,
} from "./musicSocketProtocol";

export type MusicSendCommand = (
    action: string,
    payload?: Record<string, unknown>,
) => Promise<unknown>;
export type MusicFeedback = (ok: boolean, text: string, autoDismissMs?: number) => void;

// Everything the transport primitives need. Built once per mount so the
// lifecycle effect below runs once per guild.
export interface MusicSocketCtx {    socketRef: RefObject<WebSocket | null>;
    pendingRef: RefObject<Map<string, PendingRequest>>;
    isMountedRef: RefObject<boolean>;
    setStatus: Dispatch<SetStateAction<ConnectionStatus>>;
    setActiveRequestsCount: Dispatch<SetStateAction<number>>;
    showFeedback: MusicFeedback;
}

// Command Dispatcher with Promise tracking & timeout.
export function dispatchMusicCommand(
    ctx: MusicSocketCtx,
    action: string,
    payload?: Record<string, unknown>,
): Promise<unknown> {
    return new Promise((resolve, reject) => {
        const socket = ctx.socketRef.current;
        if (socket === null || socket.readyState !== WebSocket.OPEN) {
            const err = "Not connected to the bot.";
            ctx.showFeedback(false, err);
            reject(new Error(err));
            return;
        }

        const requestId = crypto.randomUUID();

        ctx.setActiveRequestsCount((c) => c + 1);

        const timeoutId = setTimeout(() => {
            const pendingRequests = ctx.pendingRef.current;
            if (pendingRequests.has(requestId)) {
                pendingRequests.delete(requestId);
                if (ctx.isMountedRef.current) {
                    ctx.setActiveRequestsCount((c) => Math.max(0, c - 1));
                    ctx.showFeedback(false, `Command "${action}" timed out.`);
                }
                reject(new Error("Command timed out."));
            }
        }, 10000);

        ctx.pendingRef.current.set(requestId, { resolve, reject, timeoutId });

        const message = { type: "music", requestId, action, ...payload };
        try {
            socket.send(JSON.stringify(message));
        } catch (e: unknown) {
            clearTimeout(timeoutId);
            ctx.pendingRef.current.delete(requestId);
            ctx.setActiveRequestsCount((c) => Math.max(0, c - 1));
            const err = "Failed to transmit frame to server.";
            ctx.showFeedback(false, err);
            reject(e instanceof Error ? e : new Error(typeof e === "string" ? e : err));
        }
    });
}

// Routes one raw frame: command ACKs settle here, server pushes forward.
function routeIncomingFrame(
    raw: unknown,
    ctx: MusicSocketCtx,
    onNowPlaying: (data: unknown) => void,
): void {
    // 1. Handle command execution ACKs
    const ackResult = ackSchema.safeParse(raw);
    if (ackResult.success) {
        const { requestId, ok, error, data } = ackResult.data;
        if (requestId !== undefined && requestId.length > 0) {
            const pending = ctx.pendingRef.current.get(requestId);
            if (pending !== undefined) {
                clearTimeout(pending.timeoutId);
                ctx.pendingRef.current.delete(requestId);

                if (ctx.isMountedRef.current) {
                    ctx.setActiveRequestsCount((c) => Math.max(0, c - 1));
                }

                if (ok) {
                    pending.resolve(data);
                } else {
                    const errMsg = error ?? "Command failed.";
                    if (ctx.isMountedRef.current) ctx.showFeedback(false, errMsg);
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
            onNowPlaying(eventResult.data.data);
        }
    }
}

interface OpenSocketArgs {
    guildId: string;
    ctx: MusicSocketCtx;
    onNowPlayingRef: RefObject<(data: unknown) => void>;
    sendCommandRef: RefObject<MusicSendCommand>;
}

// WebSocket Lifecycle Management with Exponential Backoff. Returns teardown.
function openMusicSocket(args: OpenSocketArgs): () => void {
    const { guildId, ctx, onNowPlayingRef, sendCommandRef } = args;
    let socket: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let backoffMs = 1000;

    const rejectAllPending = (reason: string): void => {
        ctx.pendingRef.current.forEach((req) => {
            clearTimeout(req.timeoutId);
            req.reject(new Error(reason));
        });
        ctx.pendingRef.current.clear();
        if (ctx.isMountedRef.current) {
            ctx.setActiveRequestsCount(0);
        }
    };

    const connect = (): void => {
        if (!ctx.isMountedRef.current) return;

        ctx.setStatus("connecting");
        // Ticket is signed server-side; never expose INTERNAL_API_SECRET to the browser.
        void wsUrlWithTicket(guildId).then((url) => {
            if (!ctx.isMountedRef.current) return;
            socket = new WebSocket(url);
            ctx.socketRef.current = socket;

            socket.onopen = (): void => {
                if (!ctx.isMountedRef.current) return;
                backoffMs = 1000;
                ctx.setStatus("connected");
                sendCommandRef.current("nowPlaying")
                    .then((data) => {
                        onNowPlayingRef.current(data);
                    })
                    .catch(noop);
            };

            socket.onmessage = (event: Event): void => {
                if (!(event instanceof MessageEvent)) return;
                if (typeof event.data !== "string") return;
                try {
                    const raw: unknown = JSON.parse(event.data);
                    routeIncomingFrame(raw, ctx, (data) => {
                        onNowPlayingRef.current(data);
                    });
                } catch {
                    // Ignore non-JSON frames
                }
            };

            socket.onclose = (): void => {
                rejectAllPending("Connection closed.");
                if (!ctx.isMountedRef.current) return;
                ctx.setStatus("disconnected");
                reconnectTimer = setTimeout(connect, backoffMs);
                backoffMs = Math.min(backoffMs * 2, 16000);
            };

            socket.onerror = (): void => {
                socket?.close();
            };
        }).catch((err: unknown) => {
            console.error("Failed to obtain WS ticket:", err);
            ctx.setStatus("disconnected");
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
        ctx.socketRef.current = null;
    };
}

export interface UseMusicSocketReturn {
    status: ConnectionStatus;
    feedback: { ok: boolean; text: string } | null;
    setFeedback: Dispatch<SetStateAction<{ ok: boolean; text: string } | null>>;
    activeRequestsCount: number;
    sendCommand: MusicSendCommand;
    showFeedback: MusicFeedback;
}

export function useMusicSocket({
    guildId,
    isMountedRef,
    onNowPlayingRef,
}: {
    guildId: string;
    isMountedRef: RefObject<boolean>;
    onNowPlayingRef: RefObject<(data: unknown) => void>;
}): UseMusicSocketReturn {
    const socketRef = useRef<WebSocket | null>(null);
    const pendingRef = useRef<Map<string, PendingRequest>>(new Map());
    const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [status, setStatus] = useState<ConnectionStatus>("connecting");
    const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
    const [activeRequestsCount, setActiveRequestsCount] = useState<number>(0);

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
    }, [isMountedRef]);

    const ctx = useMemo<MusicSocketCtx>(
        () => ({
            socketRef,
            pendingRef,
            isMountedRef,
            setStatus,
            setActiveRequestsCount,
            showFeedback,
        }),
        [isMountedRef, showFeedback],
    );

    const sendCommand = useCallback(
        (action: string, payload?: Record<string, unknown>): Promise<unknown> =>
            dispatchMusicCommand(ctx, action, payload),
        [ctx],
    );
    const sendCommandRef = useRef(sendCommand);
    useEffect(() => {
        sendCommandRef.current = sendCommand;
    }, [sendCommand]);

    useEffect(
        () => openMusicSocket({ guildId, ctx, onNowPlayingRef, sendCommandRef }),
        [guildId, ctx, onNowPlayingRef, sendCommandRef],
    );

    return { status, feedback, setFeedback, activeRequestsCount, sendCommand, showFeedback };
}
