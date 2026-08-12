"use client";

import React, { JSX, useCallback, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/TextInput";
import { config } from "@/config";
import {
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
}

interface NowPlayingData {
    title: string;
    thumbnail?: string;
    requestedBy?: string;
    durationSec?: number;
    positionSec?: number;
    isPaused?: boolean;
}

const ackSchema = z.object({
    type: z.literal("ack"),
    requestId: z.string().optional(),
    ok: z.boolean(),
    error: z.string().optional(),
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

export function MusicControlPanel({ guildId, requestedById }: MusicControlPanelProps): JSX.Element | null {
    const [mounted, setMounted] = useState(false);
    const [status, setStatus] = useState<ConnectionStatus>("connecting");
    const [query, setQuery] = useState<string>("");
    const [busy, setBusy] = useState<boolean>(false);
    const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

    const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null);
    const [position, setPosition] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);
    const [isSeeking, setIsSeeking] = useState<boolean>(false);
    const [isPaused, setIsPaused] = useState<boolean>(false);
    const seekDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

    const socketRef = useRef<WebSocket | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    const updateNowPlayingState = useCallback((data: unknown) => {
        if (!data || typeof data !== "object") {
            setNowPlaying(null);
            setPosition(0);
            setDuration(0);
            return;
        }

        const obj = data as Record<string, unknown>;

        if (Object.keys(obj).length === 0) {
            setNowPlaying(null);
            setPosition(0);
            setDuration(0);
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
                    : undefined;

            const pausedState = typeof obj.is_paused === "boolean"
                ? obj.is_paused
                : typeof obj.isPaused === "boolean"
                    ? obj.isPaused
                    : false;

            setIsPaused(pausedState);

            setNowPlaying((prev) => ({
                title,
                thumbnail: (metadata.thumbnail as string) ?? (obj.thumbnail as string) ?? prev?.thumbnail,
                requestedBy: (obj.requested_by as string) ?? (obj.requestedBy as string) ?? prev?.requestedBy ?? "Web",
                durationSec: newDuration > 0 ? newDuration : prev?.durationSec,
                positionSec: livePosition ?? prev?.positionSec ?? 0,
                isPaused: pausedState,
            }));

            if (newDuration > 0) {
                setDuration(newDuration);
            }

            if (typeof livePosition === "number") {
                setPosition(Math.round(livePosition));
            }
        } else {
            setNowPlaying(null);
            setPosition(0);
            setDuration(0);
        }
    }, []);

    // Use ref to keep handler fresh inside persistent WebSocket listener without re-triggering connection
    const updateNowPlayingStateRef = useRef(updateNowPlayingState);
    useEffect(() => {
        updateNowPlayingStateRef.current = updateNowPlayingState;
    }, [updateNowPlayingState]);

    const sendCommand = useCallback(
        (action: string, payload?: Record<string, unknown>): Promise<unknown> => {
            return new Promise((resolve, reject) => {
                const socket = socketRef.current;
                if (!socket || socket.readyState !== WebSocket.OPEN) {
                    const err = "Not connected to the bot.";
                    setFeedback({ ok: false, text: err });
                    return reject(err);
                }

                setBusy(true);
                setFeedback(null);
                const requestId = crypto.randomUUID();
                const message = { type: "music", requestId, action, ...(payload ?? {}) };

                socket.send(JSON.stringify(message));

                const onMessage = (event: MessageEvent): void => {
                    try {
                        const raw = JSON.parse(String(event.data));
                        if (raw.type === "event") return; // Ignore push events inside request ACK handler

                        const ack = ackSchema.parse(raw);
                        if (ack.requestId !== requestId) return;

                        socket.removeEventListener("message", onMessage);
                        setBusy(false);

                        if (ack.ok) {
                            setFeedback({ ok: true, text: "Done." });

                            if (action === "nowPlaying") {
                                updateNowPlayingStateRef.current(ack.data);
                            }

                            resolve(ack.data);
                        } else {
                            const err = ack.error ?? "Command failed.";
                            setFeedback({ ok: false, text: err });
                            reject(err);
                        }
                    } catch {
                        // ignore unrelated frames
                    }
                };

                socket.addEventListener("message", onMessage);

                setTimeout(() => {
                    socket.removeEventListener("message", onMessage);
                    setBusy(false);
                    reject("Command timed out.");
                }, 10000);
            });
        },
        []
    );

    const sendCommandRef = useRef(sendCommand);
    useEffect(() => {
        sendCommandRef.current = sendCommand;
    }, [sendCommand]);

    // Persistent WebSocket connection (only re-connects if guildId changes)
    useEffect(() => {
        let closed = false;
        let socket: WebSocket | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

        const connect = (): void => {
            if (closed) return;

            setStatus("connecting");
            socket = new WebSocket(wsUrl(guildId));
            socketRef.current = socket;

            socket.onopen = (): void => {
                if (closed) return;
                setStatus("connected");
                sendCommandRef.current("nowPlaying").catch(() => {
                });
            };

            // Persistent message listener for push events pushed from Discord commands
            socket.addEventListener("message", (event: MessageEvent) => {
                try {
                    const raw = JSON.parse(String(event.data));
                    if (raw && typeof raw === "object" && raw.type === "event" && raw.event === "nowPlaying") {
                        updateNowPlayingStateRef.current(raw.data);
                    }
                } catch {
                    // ignore non-JSON or unrelated messages
                }
            });

            socket.onclose = (): void => {
                if (closed) return;
                setStatus("disconnected");
                reconnectTimer = setTimeout(connect, 3000);
            };

            socket.onerror = (): void => {
                socket?.close();
            };
        };

        connect();

        return () => {
            closed = true;
            if (reconnectTimer) clearTimeout(reconnectTimer);
            socket?.close();
            socketRef.current = null;
        };
    }, [guildId]); // ONLY depend on guildId!

    // Live seek timer: ticks locally every second when audio is playing
    useEffect(() => {
        if (status !== "connected" || isPaused || isSeeking || !nowPlaying || busy) return;

        const interval = setInterval(() => {
            setPosition((prev) => {
                if (duration > 0 && prev >= duration) {
                    clearInterval(interval);
                    sendCommandRef.current("nowPlaying").catch(() => {
                    });
                    return duration;
                }
                return prev + 1;
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [status, isPaused, isSeeking, nowPlaying, duration, busy]);

    const handlePlay = useCallback((): void => {
        const trimmed = query.trim();
        if (trimmed.length === 0) {
            setFeedback({ ok: false, text: "Enter a track name or URL to play." });
            return;
        }
        setPosition(0);
        sendCommand("play", { query: trimmed, requestedById });
        setQuery("");
        setIsPaused(false);
    }, [query, requestedById, sendCommand]);


    const handleSeekCommit = useCallback(
        (targetSeconds: number) => {
            setIsSeeking(false);

            let clamped = Math.max(0, targetSeconds);
            if (duration > 0 && clamped >= duration) {
                clamped = Math.max(0, duration - 1);
            }

            // Update UI timestamp immediately
            setPosition(clamped);

            // Cancel any pending debounced seek
            if (seekDebounceTimerRef.current) {
                clearTimeout(seekDebounceTimerRef.current);
            }

            // Send seek command 300ms after dragging/clicking stops
            seekDebounceTimerRef.current = setTimeout(() => {
                sendCommand("seek", { query: `${Math.floor(clamped)}` }).catch(() => {
                });
            }, 300);
        },
        [duration, sendCommand]
    );

    if (!mounted) {
        return (
            <section className="flex flex-col gap-4 p-4 rounded-xl bg-card text-card-foreground shadow-sm opacity-60">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-warning"/>
                        <h4 className="text-lg font-semibold">Live Control</h4>
                        <span className="text-xs text-muted-foreground">(Loading...)</span>
                    </div>
                    <div className="h-8 w-20 bg-muted rounded-md animate-pulse"/>
                </div>
                <div className="flex flex-col gap-1">
                    <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                        <span>0:00</span>
                        <span>--:--</span>
                    </div>
                    <div className="w-full h-1.5 bg-muted rounded-lg animate-pulse"/>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                    <div className="h-10 flex-1 bg-muted rounded-md animate-pulse"/>
                    <div className="h-10 w-16 bg-muted rounded-md shrink-0 animate-pulse"/>
                </div>
                <div className="flex flex-wrap gap-2">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div key={i} className="h-10 w-28 bg-muted rounded-md animate-pulse"/>
                    ))}
                </div>
            </section>
        );
    }

    const statusLabel = status === "connected" ? "Connected" : status === "connecting" ? "Connecting..." : "Disconnected";
    const statusColor = status === "connected" ? "bg-success" : status === "connecting" ? "bg-warning" : "bg-danger";

    return (
        <section
            className="flex flex-col gap-4 p-4 border border-border bg-surface rounded-xl bg-card text-card-foreground shadow-sm">
            {/* Header / Status */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${statusColor}`}/>
                    <h4 className="text-lg font-semibold">Live Control</h4>
                    <span className="text-xs text-muted-foreground">({statusLabel})</span>
                </div>
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => sendCommand("nowPlaying")}
                    disabled={status !== "connected" || busy}
                    className="text-muted-foreground"
                >
                    Sync (if breaks for some reason)
                </Button>
            </div>

            {/* Now Playing Banner */}
            {nowPlaying && (
                <div
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border bg-surface-elevated">
                    {nowPlaying.thumbnail ? (
                        <img
                            src={nowPlaying.thumbnail}
                            alt={nowPlaying.title}
                            className="w-12 h-12 rounded object-cover shrink-0"
                        />
                    ) : (
                        <div className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0">
                            🎵
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{nowPlaying.title}</p>
                        {nowPlaying.requestedBy && (
                            <p className="text-xs text-muted-foreground">Requested by {nowPlaying.requestedBy}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Real-time Seek Slider */}
            <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                    <span>{formatTime(position)}</span>
                    <span>{duration > 0 ? formatTime(duration) : "--:--"}</span>
                </div>
                <input
                    type="range"
                    min={0}
                    max={duration || 100}
                    value={position}
                    disabled={status !== "connected" || !nowPlaying}
                    onMouseDown={() => setIsSeeking(true)}
                    onTouchStart={() => setIsSeeking(true)}
                    onChange={(e) => setPosition(Number(e.target.value))}
                    onMouseUp={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
                    onTouchEnd={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
                    className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary disabled:cursor-not-allowed bg-surface-muted"
                />
            </div>

            {/* Input & Play Button */}
            <div className="flex flex-col sm:flex-row gap-2">
                <TextInput
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") handlePlay();
                    }}
                    placeholder="Track name or URL to play..."
                    disabled={status !== "connected"}
                />
                <Button onClick={handlePlay} disabled={status !== "connected" || busy} className="shrink-0">
                    Play
                </Button>
            </div>

            {/* Expanded Media Control Buttons */}
            <div className="flex flex-wrap gap-2">
                <Button
                    variant="secondary"
                    onClick={() => {
                        setPosition(0);
                        setIsPaused(false);
                        sendCommand("prev");
                    }}
                    disabled={status !== "connected" || busy}
                >
                    <SkipBackIcon/>
                </Button>
                {status !== "connected" || busy || !isPaused ?
                    <Button
                        variant="secondary"
                        onClick={() => {
                            sendCommand("pause");
                            setIsPaused(true);
                        }}
                    >
                        <PauseIcon/>
                    </Button> : <Button
                        variant="secondary"
                        onClick={() => {
                            sendCommand("resume");
                            setIsPaused(false);
                        }}
                    >
                        <PlayIcon/>
                    </Button>
                }

                <Button
                    variant="secondary"
                    onClick={() => {
                        setPosition(0);
                        setIsPaused(false);
                        sendCommand("skip");
                    }}
                    disabled={status !== "connected" || busy}
                >
                    <SkipForwardIcon/>
                </Button>
                <Button
                    variant="secondary"
                    onClick={() => {
                        sendCommand("stop");
                        setNowPlaying(null);
                        setPosition(0);
                        setDuration(0);
                    }}
                    disabled={status !== "connected" || busy}
                >
                    <SquareIcon/>
                </Button>
                <Button
                    variant="secondary"
                    onClick={() => sendCommand("shuffle")}
                    disabled={status !== "connected" || busy}
                >
                    <ShuffleIcon/>
                </Button>
                <Button
                    variant="secondary"
                    onClick={() => {
                        setPosition(0);
                        setIsPaused(false);
                        sendCommand("restart");
                    }}
                    disabled={status !== "connected" || busy}
                >
                    <RotateCcwIcon/>
                </Button>
                <Button
                    variant="danger"
                    onClick={() => sendCommand("clearQueue")}
                    disabled={status !== "connected" || busy}
                >
                    Clear Queue
                </Button>
            </div>

            {/* Feedback alert */}
            {feedback && (
                <p className={`text-sm ${feedback.ok ? "text-success" : "text-danger"}`}>
                    {feedback.text}
                </p>
            )}
        </section>
    );
}