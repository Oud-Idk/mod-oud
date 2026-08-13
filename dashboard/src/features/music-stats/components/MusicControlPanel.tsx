"use client";

import React, { JSX, useCallback, useEffect, useRef, useState } from "react";
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
    reject: (reason: string) => void;
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

function wsUrl(guildId: string): string {
    const base = config.backendInternalUrl.replace(/^http/, "ws");
    return `${base}/api/ws/control?guild_id=${encodeURIComponent(String(guildId))}`;
}

function formatTime(seconds: number): string {
    if (!seconds || isNaN(seconds) || seconds < 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function parseDuration(raw: unknown): number {
    if (typeof raw === "number") return raw;
    if (typeof raw === "object" && raw !== null) {
        const obj = raw as Record<string, unknown>;
        if (typeof obj.secs === "number") return obj.secs;
        if (typeof obj.seconds === "number") return obj.seconds;
        if (typeof obj.duration === "number") return obj.duration;
    }
    if (typeof raw === "string") {
        const parsed = parseFloat(raw);
        if (!isNaN(parsed)) return parsed;
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
    const seekDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const showFeedback = useCallback((ok: boolean, text: string, autoDismissMs = 5000) => {
        if (!isMountedRef.current) return;
        setFeedback({ ok, text });
        if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
        if (autoDismissMs > 0) {
            feedbackTimerRef.current = setTimeout(() => {
                if (isMountedRef.current) setFeedback(null);
            }, autoDismissMs);
        }
    }, []);

    const updateNowPlayingState = useCallback((data: unknown) => {
        if (!isMountedRef.current) return;

        if (!data || typeof data !== "object") {
            setNowPlaying(null);
            setPosition(0);
            setDuration(0);
            playheadAnchorRef.current = null;
            return;
        }

        const obj = data as Record<string, unknown>;
        if (Object.keys(obj).length === 0) {
            setNowPlaying(null);
            setPosition(0);
            setDuration(0);
            playheadAnchorRef.current = null;
            return;
        }

        const metadata = (obj.metadata ?? obj) as Record<string, unknown>;
        const title = (metadata.title as string) ?? (obj.title as string);

        if (title) {
            const newDuration = parseDuration(metadata.duration ?? obj.durationSec ?? metadata.durationSec);
            const livePosition = typeof obj.position_sec === "number"
                ? obj.position_sec
                : typeof obj.positionSec === "number"
                    ? obj.positionSec
                    : 0;

            const pausedState = typeof obj.is_paused === "boolean"
                ? obj.is_paused
                : typeof obj.isPaused === "boolean"
                    ? obj.isPaused
                    : false;

            const liveState = typeof obj.is_live === "boolean"
                ? obj.is_live
                : typeof obj.isLive === "boolean"
                    ? obj.isLive
                    : false;

            setIsPaused(pausedState);

            setNowPlaying((prev) => ({
                title,
                thumbnail: (metadata.thumbnail as string) ?? (obj.thumbnail as string) ?? prev?.thumbnail,
                requestedBy: (obj.requested_by as string) ?? (obj.requestedBy as string) ?? prev?.requestedBy ?? "Web",
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
                if (!socket || socket.readyState !== WebSocket.OPEN) {
                    const err = "Not connected to the bot.";
                    showFeedback(false, err);
                    return reject(err);
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
                        reject("Command timed out.");
                    }
                }, 10000);

                pendingRequestsRef.current.set(requestId, { resolve, reject, timeoutId });

                const message = { type: "music", requestId, action, ...(payload ?? {}) };
                try {
                    socket.send(JSON.stringify(message));
                } catch (e) {
                    clearTimeout(timeoutId);
                    pendingRequestsRef.current.delete(requestId);
                    setActiveRequestsCount((c) => Math.max(0, c - 1));
                    const err = "Failed to transmit frame to server.";
                    showFeedback(false, err);
                    reject(e || err);
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
    const handleIncomingFrame = useCallback((event: MessageEvent) => {
        try {
            const raw = JSON.parse(String(event.data));

            // 1. Handle command execution ACKs
            const ackResult = ackSchema.safeParse(raw);
            if (ackResult.success) {
                const { requestId, ok, error, data } = ackResult.data;
                if (requestId && pendingRequestsRef.current.has(requestId)) {
                    const pending = pendingRequestsRef.current.get(requestId)!;
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
                        pending.reject(errMsg);
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

        const rejectAllPending = (reason: string) => {
            pendingRequestsRef.current.forEach((req) => {
                clearTimeout(req.timeoutId);
                req.reject(reason);
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
                    .catch(() => {});
            };

            socket.onmessage = (event: MessageEvent) => {
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
            if (reconnectTimer) clearTimeout(reconnectTimer);
            if (socket) {
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
                .catch(() => {});
        }, 5000);
        return () => clearInterval(heartbeat);
    }, [status]);

    // Drift-Free Audio Position Playhead Engine
    useEffect(() => {
        if (status !== "connected" || isPaused || isSeeking || !nowPlaying) return;
        if (nowPlaying.isLive) return;

        const interval = setInterval(() => {
            if (!playheadAnchorRef.current || isSeeking) return;

            const elapsedSec = (performance.now() - playheadAnchorRef.current.timestamp) / 1000;
            const currentComputed = Math.floor(playheadAnchorRef.current.basePos + elapsedSec);

            if (duration > 0 && currentComputed >= duration) {
                setPosition(duration);
                clearInterval(interval);
                sendCommandRef.current("nowPlaying").catch(() => {});
                return;
            }

            setPosition(currentComputed);
        }, 500);

        return () => clearInterval(interval);
    }, [status, isPaused, isSeeking, nowPlaying, duration]);

    // Controls Logic
    const handlePlay = useCallback((): void => {
        const trimmed = query.trim();
        if (trimmed.length === 0) {
            showFeedback(false, "Enter a track name or URL to play.");
            return;
        }
        setPosition(0);
        sendCommand("play", { query: trimmed, requestedById })
            .then(() => sendCommand("nowPlaying"))
            .catch(() => {return});
        setQuery("");
        setIsPaused(false);
    }, [query, requestedById, sendCommand, showFeedback]);

    const handleSeekCommit = useCallback(
        (targetSeconds: number) => {
            // Keep isSeeking = true to freeze local timer and incoming socket position updates
            setIsSeeking(true);

            let clamped = Math.max(0, targetSeconds);
            if (duration > 0 && clamped >= duration) {
                clamped = Math.max(0, duration - 1);
            }

            // Immediately lock slider to desired target position
            setPosition(clamped);

            if (seekDebounceTimerRef.current) {
                clearTimeout(seekDebounceTimerRef.current);
            }

            seekDebounceTimerRef.current = setTimeout(() => {
                sendCommand("seek", { query: `${Math.floor(clamped)}` })
                    .then(() => {
                        // Update playhead anchor timestamp on successful seek ACK
                        playheadAnchorRef.current = {
                            basePos: clamped,
                            timestamp: performance.now(),
                        };
                    })
                    .catch(() => {
                        // Re-sync on failure
                        sendCommandRef.current("nowPlaying").catch(() => {return});
                    })
                    .finally(() => {
                        if (isMountedRef.current) {
                            setIsSeeking(false);
                        }
                    });
            }, 300);
        },
        [duration, sendCommand]
    );

    const handleGoToChannel = useCallback((): void => {
        if (!targetChannel) return;
        sendCommand("goToChannel", { query: targetChannel }).catch(() => {});
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
    const statusLabel = status === "connected" ? "Connected" : status === "connecting" ? "Connecting..." : "Disconnected";
    const statusColor = status === "connected" ? "bg-success" : status === "connecting" ? "bg-warning" : "bg-danger";

    return (
        <section
            aria-label="Music Control Panel"
            className="flex flex-col gap-4 p-4 border border-border bg-surface rounded-xl bg-card text-card-foreground shadow-sm"
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
                    onClick={() => sendCommand("nowPlaying")}
                    disabled={!isConnected || isBusy}
                    className="text-muted-foreground"
                >
                    Sync State
                </Button>
            </div>

            {/* Now Playing Banner */}
            {nowPlaying && (
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border bg-surface-elevated">
                    {nowPlaying.thumbnail ? (
                        <img
                            src={nowPlaying.thumbnail}
                            alt={nowPlaying.title}
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
                            {nowPlaying.isLive && (
                                <span
                                    className="shrink-0 text-xs font-semibold text-danger border border-danger/40 rounded px-1.5 py-0.5"
                                    role="status"
                                    aria-live="polite"
                                >
                                    ● LIVE
                                </span>
                            )}
                        </div>
                        {nowPlaying.requestedBy && (
                            <p className="text-xs text-muted-foreground">Requested by {nowPlaying.requestedBy}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Real-time Seek Slider */}
            {nowPlaying?.isLive ? (
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
                        max={duration || 100}
                        value={position}
                        disabled={!isConnected || !nowPlaying}
                        onPointerDown={() => setIsSeeking(true)}
                        onChange={(e) => setPosition(Number(e.target.value))}
                        onPointerUp={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
                        className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary disabled:cursor-not-allowed bg-surface-muted"
                    />
                </div>
            )}

            {/* Input & Play Button */}
            <div className="flex flex-col sm:flex-row gap-2">
                <TextInput
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        if (feedback) setFeedback(null);
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
                    onClick={() => {
                        setPosition(0);
                        setIsPaused(false);
                        sendCommand("prev");
                    }}
                    disabled={!isConnected || isBusy}
                >
                    <SkipBackIcon />
                </Button>

                {isPaused ? (
                    <Button
                        variant="secondary"
                        aria-label="Resume Playback"
                        onClick={() => {
                            sendCommand("resume");
                            setIsPaused(false);
                        }}
                        disabled={!isConnected || isBusy}
                    >
                        <PlayIcon />
                    </Button>
                ) : (
                    <Button
                        variant="secondary"
                        aria-label="Pause Playback"
                        onClick={() => {
                            sendCommand("pause");
                            setIsPaused(true);
                        }}
                        disabled={!isConnected || isBusy}
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
                        sendCommand("skip");
                    }}
                    disabled={!isConnected || isBusy}
                >
                    <SkipForwardIcon />
                </Button>

                <Button
                    variant="secondary"
                    aria-label="Stop Playback"
                    onClick={() => {
                        sendCommand("stop");
                        setNowPlaying(null);
                        setPosition(0);
                        setDuration(0);
                    }}
                    disabled={!isConnected || isBusy}
                >
                    <SquareIcon />
                </Button>

                <Button
                    variant="secondary"
                    aria-label="Shuffle Queue"
                    onClick={() => sendCommand("shuffle")}
                    disabled={!isConnected || isBusy}
                >
                    <ShuffleIcon />
                </Button>

                <Button
                    variant="secondary"
                    aria-label="Restart Track"
                    onClick={() => {
                        setPosition(0);
                        setIsPaused(false);
                        sendCommand("restart");
                    }}
                    disabled={!isConnected || isBusy}
                >
                    <RotateCcwIcon />
                </Button>

                <Button
                    variant="danger"
                    onClick={() => sendCommand("clearQueue")}
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
                    disabled={!isConnected || isBusy || !targetChannel}
                    className="shrink-0"
                >
                    <MoveHorizontalIcon className="mr-2" />
                    Go to Channel
                </Button>
            </div>

            {/* Dynamic Alert Feedback */}
            {feedback && (
                <p role="status" aria-live="polite" className={`text-sm ${feedback.ok ? "text-success" : "text-danger"}`}>
                    {feedback.text}
                </p>
            )}
        </section>
    );
}