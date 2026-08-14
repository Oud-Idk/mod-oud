"use client";

import React, { JSX, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { Dropdown } from "@/components/ui/Dropdown";
import { TextInput } from "@/components/ui/TextInput";
import { config } from "@/config";
import { getAvailableChannelOptions } from "@/features/_shared/dropdown";
import {
    MoveHorizontalIcon,
    PauseIcon,
    PlayIcon,
    RotateCcwIcon,
    ShuffleIcon,
    SkipBackIcon,
    SkipForwardIcon,
    SquareIcon
} from "lucide-react";

type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface MusicControlPanelProps {
    guildId: string;
    requestedById?: string;
    voiceChannelMap: Record<string, string>;
}

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

const nowPlayingPayloadSchema = z.object({
    title: z.string().optional(),
    thumbnail: z.string().optional(),
    requested_by: z.string().optional(),
    requestedBy: z.string().optional(),
    duration: z.union([z.number(), z.string(), durationObjectSchema]).optional(),
    durationSec: z.union([z.number(), z.string(), durationObjectSchema]).optional(),
    position_sec: z.number().optional(),
    positionSec: z.number().optional(),
    is_paused: z.boolean().optional(),
    isPaused: z.boolean().optional(),
    is_live: z.boolean().optional(),
    isLive: z.boolean().optional(),
    metadata: z.object({
        title: z.string().optional(),
        thumbnail: z.string().optional(),
        duration: z.union([z.number(), z.string(), durationObjectSchema]).optional(),
        durationSec: z.union([z.number(), z.string(), durationObjectSchema]).optional(),
    }).optional(),
});

const noop = (_err?: unknown): void => {
    // Silently ignored background handler
};

function wsUrl(guildId: string): string {
    const base = config.backendInternalUrl.replace(/^http/, "ws");
    return `${base}/api/ws/control?guild_id=${encodeURIComponent(guildId)}`;
}

function formatTime(seconds: number): string {
    if (Number.isNaN(seconds) || seconds <= 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins)}:${secs.toString().padStart(2, "0")}`;
}

function parseDuration(raw: unknown): number {
    if (typeof raw === "number") return raw;
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

export function MusicControlPanel({ guildId, requestedById, voiceChannelMap }: MusicControlPanelProps): JSX.Element | null {
    const [mounted, setMounted] = useState(false);
    const [status, setStatus] = useState<ConnectionStatus>("connecting");
    const [query, setQuery] = useState<string>("");
    const [activeRequestsCount, setActiveRequestsCount] = useState<number>(0);
    const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
    const [targetChannel, setTargetChannel] = useState<string | null>(null);

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
        setMounted(true);
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
                requestedBy: item.requested_by ?? item.requestedBy ?? prev?.requestedBy ?? "Web",
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

                const message = { type: "music", requestId, action, ...(payload ?? {}) };
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
            socket = new WebSocket(wsUrl(guildId));
            socketRef.current = socket;

            socket.onopen = (): void => {
                if (!isMountedRef.current) return;
                backoffMs = 1000; // Reset backoff on successful connection
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
                // Exponential backoff reconnect logic up to 16s max
                reconnectTimer = setTimeout(connect, backoffMs);
                backoffMs = Math.min(backoffMs * 2, 16000);
            };

            socket.onerror = (): void => {
                socket?.close();
            };
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

    // Controls Logic
    const handlePlay = useCallback((): void => {
        const trimmed = query.trim();
        if (trimmed.length === 0) {
            showFeedback(false, "Enter a track name or URL to play.");
            return;
        }
        setPosition(0);
        setIsPaused(false);
        playheadAnchorRef.current = {
            basePos: 0,
            timestamp: performance.now(),
        };
        void sendCommand("play", { query: trimmed, requestedById })
            .then(() => sendCommand("nowPlaying"))
            .catch(noop);
        setQuery("");
    }, [query, requestedById, sendCommand, showFeedback]);

    const handleResume = useCallback((): void => {
        setIsPaused(false);
        // Re-anchor timestamp on resume to eliminate playhead jump
        playheadAnchorRef.current = {
            basePos: position,
            timestamp: performance.now(),
        };
        void sendCommand("resume").catch(noop);
    }, [position, sendCommand]);

    const handlePause = useCallback((): void => {
        setIsPaused(true);
        void sendCommand("pause").catch(noop);
    }, [sendCommand]);

    const handlePrevious = useCallback((): void => {
        setPosition(0);
        setIsPaused(false);
        playheadAnchorRef.current = {
            basePos: 0,
            timestamp: performance.now(),
        };

        // 1. If playback > 5s and not live, repeat track. Otherwise go to previous track.
        if (position > 5 && !nowPlaying?.isLive) {
            void sendCommand("restart").catch(noop);
        } else {
            void sendCommand("prev").catch(noop);
        }
    }, [position, nowPlaying?.isLive, sendCommand]);

    const handleRestart = useCallback((): void => {
        setPosition(0);
        setIsPaused(false);
        playheadAnchorRef.current = {
            basePos: 0,
            timestamp: performance.now(),
        };
        void sendCommand("restart").catch(noop);
    }, [sendCommand]);

    const handleSeekCommit = useCallback(
        (targetSeconds: number): void => {
            let clamped = Math.max(0, targetSeconds);
            if (duration > 0 && clamped >= duration) {
                clamped = Math.max(0, duration - 1);
            }

            setPosition(clamped);
            playheadAnchorRef.current = {
                basePos: clamped,
                timestamp: performance.now(),
            };

            void sendCommand("seek", { query: String(Math.floor(clamped)) })
                .then(() => {
                    playheadAnchorRef.current = {
                        basePos: clamped,
                        timestamp: performance.now(),
                    };
                })
                .catch(() => {
                    void sendCommandRef.current("nowPlaying").catch(noop);
                })
                .finally(() => {
                    if (isMountedRef.current) {
                        setIsSeeking(false);
                    }
                });
        },
        [duration, sendCommand]
    );

    const handleGoToChannel = useCallback((): void => {
        if (targetChannel === null || targetChannel.length === 0) return;
        void sendCommand("goToChannel", { query: targetChannel }).catch(noop);
    }, [targetChannel, sendCommand]);

    if (!mounted) {
        return (
            <section className="flex flex-col gap-4 p-4 rounded-xl bg-card text-card-foreground shadow-sm opacity-60">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-warning" />
                        <h4 className="text-lg font-semibold">Live Control</h4>
                        <span className="text-xs text-muted-foreground">(Loading...)</span>
                    </div>
                    <div className="h-8 w-20 bg-muted rounded-md animate-pulse" />
                </div>
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                        <span>0:00</span>
                        <span>--:--</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-lg animate-pulse" />
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="h-10 flex-1 bg-muted rounded-md animate-pulse" />
                    <div className="h-10 w-16 bg-muted rounded-md shrink-0 animate-pulse" />
                </div>
                <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-10 w-28 bg-muted rounded-md animate-pulse" />
                    ))}
                </div>
            </section>
        );
    }

    const isConnected = status === "connected";
    const isBusy = activeRequestsCount > 0;
    const hasTrack = nowPlaying !== null;
    const isLiveStream = Boolean(nowPlaying?.isLive);

    const statusLabel = status === "connected" ? "Connected" : status === "connecting" ? "Connecting..." : "Disconnected";
    const statusColor = status === "connected" ? "bg-success" : status === "connecting" ? "bg-warning" : "bg-danger";

    return (
        <section
            aria-label="Music Control Panel"
            className="flex flex-col gap-4 p-4 border border-border rounded-xl bg-card text-card-foreground shadow-sm"
        >
            {/* Header / Status */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2" role="status" aria-live="polite">
                    <span className={`w-2.5 h-2.5 rounded-full ${statusColor}`} aria-hidden="true" />
                    <h4 className="text-lg font-semibold">Live Control</h4>
                    <span className="text-xs text-muted-foreground">({statusLabel})</span>
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                        void sendCommand("nowPlaying").catch(noop);
                    }}
                    disabled={!isConnected || isBusy}
                    className="text-muted-foreground"
                >
                    Sync State
                </Button>
            </div>

            {/* Now Playing Banner */}
            {nowPlaying !== null && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
                    {nowPlaying.thumbnail !== undefined && nowPlaying.thumbnail.length > 0 ? (
                        <Image
                            src={nowPlaying.thumbnail}
                            alt={nowPlaying.title}
                            width={48}
                            height={48}
                            unoptimized
                            className="w-12 h-12 rounded object-cover shrink-0"
                        />
                    ) : (
                        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0" aria-hidden="true">
                            🎵
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{nowPlaying.title}</p>
                            {isLiveStream && (
                                <span
                                    className="shrink-0 text-xs font-semibold text-danger border border-danger/40 rounded px-1.5 py-0.5"
                                    role="status"
                                    aria-live="polite"
                                >
                                    ● LIVE
                                </span>
                            )}
                        </div>
                        {nowPlaying.requestedBy !== undefined && nowPlaying.requestedBy.length > 0 && (
                            <p className="text-xs text-muted-foreground">Requested by {nowPlaying.requestedBy}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Real-time Seek Slider */}
            {isLiveStream ? (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                        <span className="text-danger">🔴 Live Stream</span>
                        <span>∞</span>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                        <span>{formatTime(position)}</span>
                        <span>{duration > 0 ? formatTime(duration) : "--:--"}</span>
                    </div>
                    <input
                        type="range"
                        aria-label="Track playback position"
                        min={0}
                        max={duration > 0 ? duration : 100}
                        value={position}
                        disabled={!isConnected || !hasTrack}
                        onPointerDown={() => { setIsSeeking(true) }}
                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                            setPosition(Number(e.target.value));
                        }}
                        onPointerUp={(e: React.PointerEvent<HTMLInputElement>) => {
                            handleSeekCommit(Number(e.currentTarget.value));
                        }}
                        onKeyUp={(e: React.KeyboardEvent<HTMLInputElement>) => {
                            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(e.key)) {
                                handleSeekCommit(Number(e.currentTarget.value));
                            }
                        }}
                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary disabled:cursor-not-allowed"
                    />
                </div>
            )}

            {/* Input & Play Button */}
            <div className="flex flex-col sm:flex-row gap-2">
                <TextInput
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        if (feedback !== null) setFeedback(null);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handlePlay();
                    }}
                    placeholder="Track name or URL to play..."
                    disabled={!isConnected}
                />
                <Button onClick={handlePlay} disabled={!isConnected || isBusy} className="shrink-0">
                    Play
                </Button>
            </div>

            {/* Media Control Buttons */}
            <div className="flex flex-wrap gap-2">
                <Button
                    variant="secondary"
                    aria-label="Previous Track"
                    onClick={handlePrevious}
                    disabled={!isConnected || isBusy || !hasTrack}
                >
                    <SkipBackIcon />
                </Button>

                {isPaused ? (
                    <Button
                        variant="secondary"
                        aria-label="Resume Playback"
                        onClick={handleResume}
                        disabled={!isConnected || isBusy || !hasTrack}
                    >
                        <PlayIcon />
                    </Button>
                ) : (
                    <Button
                        variant="secondary"
                        aria-label="Pause Playback"
                        onClick={handlePause}
                        disabled={!isConnected || isBusy || !hasTrack}
                    >
                        <PauseIcon />
                    </Button>
                )}

                <Button
                    variant="secondary"
                    aria-label="Skip Track"
                    onClick={() => {
                        setPosition(0);
                        setIsPaused(false);
                        void sendCommand("skip").catch(noop);
                    }}
                    disabled={!isConnected || isBusy || !hasTrack}
                >
                    <SkipForwardIcon />
                </Button>

                <Button
                    variant="secondary"
                    aria-label="Stop Playback"
                    onClick={() => {
                        void sendCommand("stop").catch(noop);
                        setNowPlaying(null);
                        setPosition(0);
                        setDuration(0);
                    }}
                    disabled={!isConnected || isBusy || !hasTrack}
                >
                    <SquareIcon />
                </Button>

                <Button
                    variant="secondary"
                    aria-label="Shuffle Queue"
                    onClick={() => {
                        void sendCommand("shuffle").catch(noop);
                    }}
                    disabled={!isConnected || isBusy}
                >
                    <ShuffleIcon />
                </Button>

                {/* 2. Restart track button is disabled on Live Streams */}
                <Button
                    variant="secondary"
                    aria-label="Restart Track"
                    onClick={handleRestart}
                    disabled={!isConnected || isBusy || !hasTrack || isLiveStream}
                >
                    <RotateCcwIcon />
                </Button>

                <Button
                    variant="danger"
                    onClick={() => {
                        void sendCommand("clearQueue").catch(noop);
                    }}
                    disabled={!isConnected || isBusy}
                >
                    Clear Queue
                </Button>
            </div>

            {/* Channel Selection */}
            <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1 min-w-40">
                    <Dropdown
                        value={targetChannel}
                        onChange={setTargetChannel}
                        options={getAvailableChannelOptions(voiceChannelMap)}
                        placeholder="Move bot to a voice channel..."
                        allowClear
                        disabled={!isConnected}
                    />
                </div>
                <Button
                    variant="secondary"
                    onClick={handleGoToChannel}
                    disabled={!isConnected || isBusy || targetChannel === null || targetChannel.length === 0}
                    className="shrink-0"
                >
                    <MoveHorizontalIcon className="mr-2" />
                    Go to Channel
                </Button>
            </div>

            {/* Dynamic Alert Feedback */}
            {feedback !== null && (
                <p role="status" aria-live="polite" className={`text-sm ${feedback.ok ? "text-success" : "text-danger"}`}>
                    {feedback.text}
                </p>
            )}
        </section>
    );
}