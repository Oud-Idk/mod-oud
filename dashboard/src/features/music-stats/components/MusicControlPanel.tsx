"use client";

import React, { JSX, useCallback, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/inputs/Button";
import { Dropdown } from "@/components/ui/inputs/Dropdown";
import { TextInput } from "@/components/ui/inputs/TextInput";
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
import { ConnectionStatusPill } from "@/components/ui/ConnectionStatusPill";
import { User } from "next-auth";
import { useMusicConnection } from "./useMusicConnection";

const noop = (_err?: unknown): void => {
    // Silently ignored background handler
};

interface MusicControlPanelProps {
    guildId: string;
    userAuth?: User;
    voiceChannelMap: Record<string, string>;
}

function formatTime(seconds: number): string {
    if (Number.isNaN(seconds) || seconds <= 0) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins)}:${secs.toString().padStart(2, "0")}`;
}

export function MusicControlPanel({
    guildId,
    userAuth,
    voiceChannelMap
}: MusicControlPanelProps): JSX.Element | null {
    const mounted = useSyncExternalStore(
        () => (): void => undefined,
        () => true,
        () => false
    );
    const [query, setQuery] = useState<string>("");
    const [targetChannel, setTargetChannel] = useState<string | null>(null);

    const {
        status,
        nowPlaying,
        position,
        duration,
        isPaused,
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
    } = useMusicConnection({ guildId });


    const handlePlay = useCallback((): void => {
        const trimmed = query.trim();
        if (trimmed.length === 0) {
            showFeedback(false, "Enter a track name or URL to play.");
            return;
        }

        if (userAuth?.id === undefined || userAuth.name === undefined) {
            showFeedback(false, "Seems like some info about your account is missing. You may need to re-login.");
            return;
        }

        setPosition(0);
        setIsPaused(false);
        playheadAnchorRef.current = {
            basePos: 0,
            timestamp: performance.now(),
        };
        void sendCommand("play", {
            query: trimmed, requestedBy: {
                id: userAuth.id,
                name: userAuth.name,
            }
        })
            .then(() => sendCommand("nowPlaying"))
            .catch(noop);
        setQuery("");
    }, [query, userAuth, sendCommand, showFeedback, setPosition, setIsPaused, playheadAnchorRef]);

    const handleResume = useCallback((): void => {
        setIsPaused(false);
        // Re-anchor timestamp on resume to eliminate playhead jump
        playheadAnchorRef.current = {
            basePos: position,
            timestamp: performance.now(),
        };
        void sendCommand("resume").catch(noop);
    }, [position, sendCommand, setIsPaused, playheadAnchorRef]);

    const handlePause = useCallback((): void => {
        setIsPaused(true);
        void sendCommand("pause").catch(noop);
    }, [sendCommand, setIsPaused]);

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
    }, [position, nowPlaying?.isLive, sendCommand, setPosition, setIsPaused, playheadAnchorRef]);

    const handleRestart = useCallback((): void => {
        setPosition(0);
        setIsPaused(false);
        playheadAnchorRef.current = {
            basePos: 0,
            timestamp: performance.now(),
        };
        void sendCommand("restart").catch(noop);
    }, [sendCommand, setPosition, setIsPaused, playheadAnchorRef]);

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

            void sendCommand("seek", { input: String(Math.floor(clamped)) })
                .then(() => {
                    playheadAnchorRef.current = {
                        basePos: clamped,
                        timestamp: performance.now(),
                    };
                })
                .catch(() => {
                    void sendCommand("nowPlaying").catch(noop);
                })
                .finally(() => {
                    if (isMountedRef.current) {
                        setIsSeeking(false);
                    }
                });
        },
        [duration, sendCommand, isMountedRef, playheadAnchorRef, setIsSeeking, setPosition]
    );

    const handleGoToChannel = useCallback((): void => {
        if (targetChannel === null || targetChannel.length === 0) return;
        void sendCommand("goToChannel", { channelId: targetChannel }).catch(noop);
    }, [targetChannel, sendCommand]);

    if (!mounted) {
        return (
            <section
                className="flex flex-col gap-4 p-4 rounded-xl bg-card text-card-foreground shadow-sm opacity-60">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-warning"/>
                        <h4 className="text-lg font-semibold">Live Control</h4>
                        <span className="text-xs text-muted-foreground">(Loading...)</span>
                    </div>
                    <div className="h-8 w-20 bg-muted rounded-md animate-pulse"/>
                </div>
                <div className="flex flex-col gap-1">
                    <div
                        className="flex items-center justify-between text-xs text-muted-foreground font-mono">
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

    const isConnected = status === "connected";
    const isBusy = activeRequestsCount > 0;
    const hasTrack = nowPlaying !== null;
    const isLiveStream = Boolean(nowPlaying?.isLive);

    const statusLabel = status === "connected" ? "CONNECTED" : status === "connecting" ? "CONNECTING" : "DISCONNECTED";

    return (
        <section
            aria-label="Music Control Panel"
            className="flex flex-col gap-4 p-4 border border-border rounded-xl bg-card text-card-foreground shadow-sm"
        >
            {/* Header / Status */}
            <div className="flex items-center justify-between">
                <output className="flex items-center gap-2" aria-live="polite">
                    <h4 className="text-lg font-semibold">Live Control</h4>
                    <ConnectionStatusPill status={statusLabel}/>
                </output>
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
                <div
                    className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 border border-border">
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
                        <div
                            className="w-12 h-12 rounded bg-muted flex items-center justify-center shrink-0"
                            aria-hidden="true">
                            🎵
                        </div>
                    )}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-medium truncate">{nowPlaying.title}</p>
                            {isLiveStream && (
                                <output
                                    className="shrink-0 text-xs font-semibold text-danger border border-danger/40 rounded px-1.5 py-0.5"
                                    aria-live="polite"
                                >
                                    ● LIVE
                                </output>
                            )}
                        </div>
                        {nowPlaying.requestedBy !== undefined && nowPlaying.requestedBy.length > 0 && (
                            <p className="text-xs text-muted-foreground">Requested
                                by {nowPlaying.requestedBy}</p>
                        )}
                    </div>
                </div>
            )}

            {/* Real-time Seek Slider */}
            {isLiveStream ? (
                <div className="flex flex-col gap-1">
                    <div
                        className="flex items-center justify-between text-xs text-muted-foreground font-mono">
                        <span className="text-danger">🔴 Live Stream</span>
                        <span>∞</span>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-1">
                    <div
                        className="flex items-center justify-between text-xs text-muted-foreground font-mono">
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
                        onPointerDown={() => {
                            setIsSeeking(true)
                        }}
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
                        className="w-full h-1.5 bg-surface-active rounded-lg appearance-none cursor-pointer accent-primary disabled:cursor-not-allowed"
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
                    <SkipBackIcon/>
                </Button>

                {isPaused ? (
                    <Button
                        variant="secondary"
                        aria-label="Resume Playback"
                        onClick={handleResume}
                        disabled={!isConnected || isBusy || !hasTrack}
                    >
                        <PlayIcon/>
                    </Button>
                ) : (
                    <Button
                        variant="secondary"
                        aria-label="Pause Playback"
                        onClick={handlePause}
                        disabled={!isConnected || isBusy || !hasTrack}
                    >
                        <PauseIcon/>
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
                    <SkipForwardIcon/>
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
                    <SquareIcon/>
                </Button>

                <Button
                    variant="secondary"
                    aria-label="Shuffle Queue"
                    onClick={() => {
                        void sendCommand("shuffle").catch(noop);
                    }}
                    disabled={!isConnected || isBusy}
                >
                    <ShuffleIcon/>
                </Button>

                {/* 2. Restart track button is disabled on Live Streams */}
                <Button
                    variant="secondary"
                    aria-label="Restart Track"
                    onClick={handleRestart}
                    disabled={!isConnected || isBusy || !hasTrack || isLiveStream}
                >
                    <RotateCcwIcon/>
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
                    <MoveHorizontalIcon className="mr-2"/>
                    Go to Channel
                </Button>
            </div>

            {/* Dynamic Alert Feedback */}
            {feedback !== null && (
                <output aria-live="polite"
                   className={`text-sm ${feedback.ok ? "text-success" : "text-danger"}`}>
                    {feedback.text}
                </output>
            )}
        </section>
    );
}