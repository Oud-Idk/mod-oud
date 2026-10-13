import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type Dispatch,
    type RefObject,
    type SetStateAction,
} from "react";
import {
    nowPlayingPayloadSchema,
    parseDuration,
    parseRequester,
    noop,
    type NowPlayingData,
} from "./musicSocketProtocol";
import {
    useMusicSocket,
    type MusicFeedback,
    type MusicSendCommand,
} from "./useMusicSocket";

export interface PlaybackStore {
    setNowPlaying: Dispatch<SetStateAction<NowPlayingData | null>>;
    setPosition: Dispatch<SetStateAction<number>>;
    setDuration: Dispatch<SetStateAction<number>>;
    setIsPaused: Dispatch<SetStateAction<boolean>>;
    isMountedRef: RefObject<boolean>;
    isSeeking: boolean;
    playheadAnchorRef: RefObject<{ basePos: number; timestamp: number } | null>;
}

// Folds one validated payload into playback state. Module-level so the
// owning hook stays a thin composer.
export function applyNowPlayingUpdate(data: unknown, store: PlaybackStore): void {
    if (!store.isMountedRef.current) return;

    const parseResult = nowPlayingPayloadSchema.safeParse(data);
    if (!parseResult.success) {
        store.setNowPlaying(null);
        store.setPosition(0);
        store.setDuration(0);
        store.playheadAnchorRef.current = null;
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

        store.setIsPaused(pausedState);

        store.setNowPlaying((prev) => ({
            title,
            thumbnail: item.metadata?.thumbnail ?? item.thumbnail ?? prev?.thumbnail,
            requestedBy: parseRequester(item.requested_by) ?? parseRequester(item.requestedBy) ?? prev?.requestedBy ?? "Web",
            durationSec: newDuration > 0 ? newDuration : prev?.durationSec,
            positionSec: livePosition,
            isPaused: pausedState,
            isLive: liveState,
        }));

        store.setDuration(newDuration);
        if (!store.isSeeking) {
            store.setPosition(Math.round(livePosition));
            store.playheadAnchorRef.current = {
                basePos: livePosition,
                timestamp: performance.now(),
            };
        }
    } else {
        store.setNowPlaying(null);
        store.setPosition(0);
        store.setDuration(0);
        store.playheadAnchorRef.current = null;
    }
}

interface ClockArgs {
    status: "connecting" | "connected" | "disconnected";
    sendCommand: MusicSendCommand;
    onNowPlayingRef: RefObject<(data: unknown) => void>;
}

// Periodic now-playing heartbeat: resyncs live state with the bot every 5s.
function useNowPlayingHeartbeat({ status, sendCommand, onNowPlayingRef }: ClockArgs): void {
    useEffect(() => {
        if (status !== "connected") return;
        const heartbeat = setInterval(() => {
            sendCommand("nowPlaying")
                .then((data) => {
                    onNowPlayingRef.current(data);
                })
                .catch(noop);
        }, 5000);
        return () => {
            clearInterval(heartbeat);
        };
    }, [status, sendCommand, onNowPlayingRef]);
}

interface PlayheadArgs {
    status: "connecting" | "connected" | "disconnected";
    sendCommand: MusicSendCommand;
    snapshot: {
        isPaused: boolean;
        isSeeking: boolean;
        nowPlaying: NowPlayingData | null;
        duration: number;
    };
    setPosition: Dispatch<SetStateAction<number>>;
    playheadAnchorRef: RefObject<{ basePos: number; timestamp: number } | null>;
}

// Drift-Free Audio Position Playhead Engine.
function usePlayheadClock({ status, sendCommand, snapshot, setPosition, playheadAnchorRef }: PlayheadArgs): void {
    useEffect(() => {
        if (status !== "connected" || snapshot.isPaused || snapshot.isSeeking || snapshot.nowPlaying === null) return;
        if (snapshot.nowPlaying.isLive === true) return;

        const interval = setInterval(() => {
            if (playheadAnchorRef.current === null) return;

            const elapsedSec = (performance.now() - playheadAnchorRef.current.timestamp) / 1000;
            const currentComputed = Math.floor(playheadAnchorRef.current.basePos + elapsedSec);

            if (snapshot.duration > 0 && currentComputed >= snapshot.duration) {
                setPosition(snapshot.duration);
                clearInterval(interval);
                void sendCommand("nowPlaying").catch(noop);
                return;
            }

            setPosition(currentComputed);
        }, 500);

        return () => {
            clearInterval(interval);
        };
    }, [
        status,
        sendCommand,
        snapshot.isPaused,
        snapshot.isSeeking,
        snapshot.nowPlaying,
        snapshot.duration,
        setPosition,
        playheadAnchorRef,
    ]);
}

export interface UseMusicConnectionReturn {
    status: "connecting" | "connected" | "disconnected";
    nowPlaying: NowPlayingData | null;
    position: number;
    duration: number;
    isPaused: boolean;
    activeRequestsCount: number;
    feedback: { ok: boolean; text: string } | null;
    setFeedback: Dispatch<SetStateAction<{ ok: boolean; text: string } | null>>;
    setNowPlaying: Dispatch<SetStateAction<NowPlayingData | null>>;
    setDuration: Dispatch<SetStateAction<number>>;
    sendCommand: MusicSendCommand;
    showFeedback: MusicFeedback;
    setPosition: Dispatch<SetStateAction<number>>;
    setIsPaused: Dispatch<SetStateAction<boolean>>;
    setIsSeeking: Dispatch<SetStateAction<boolean>>;
    playheadAnchorRef: RefObject<{ basePos: number; timestamp: number } | null>;
    isMountedRef: RefObject<boolean>;
}

// Playback state over the socket transport. Thin composer: transport,
// clock, and update logic each live in their own unit above.
export function useMusicConnection({ guildId }: { guildId: string }): UseMusicConnectionReturn {
    const [nowPlaying, setNowPlaying] = useState<NowPlayingData | null>(null);
    const [position, setPosition] = useState<number>(0);
    const [duration, setDuration] = useState<number>(0);
    const [isSeeking, setIsSeeking] = useState<boolean>(false);
    const [isPaused, setIsPaused] = useState<boolean>(false);

    // Anchor time ref for high-precision playhead time calculations without drift
    const playheadAnchorRef = useRef<{ basePos: number; timestamp: number } | null>(null);
    const isMountedRef = useRef<boolean>(true);
    useEffect(() => {
        isMountedRef.current = true;
        return () => {
            isMountedRef.current = false;
        };
    }, []);

    const updateNowPlayingState = useCallback((data: unknown): void => {
        applyNowPlayingUpdate(data, {
            setNowPlaying,
            setPosition,
            setDuration,
            setIsPaused,
            isMountedRef,
            isSeeking,
            playheadAnchorRef,
        });
    }, [isSeeking]);
    const updateNowPlayingStateRef = useRef(updateNowPlayingState);
    useEffect(() => {
        updateNowPlayingStateRef.current = updateNowPlayingState;
    }, [updateNowPlayingState]);

    const socket = useMusicSocket({ guildId, isMountedRef, onNowPlayingRef: updateNowPlayingStateRef });
    useNowPlayingHeartbeat({
        status: socket.status,
        sendCommand: socket.sendCommand,
        onNowPlayingRef: updateNowPlayingStateRef,
    });
    usePlayheadClock({
        status: socket.status,
        sendCommand: socket.sendCommand,
        snapshot: { isPaused, isSeeking, nowPlaying, duration },
        setPosition,
        playheadAnchorRef,
    });

    return {
        status: socket.status,
        nowPlaying,
        position,
        duration,
        isPaused,
        activeRequestsCount: socket.activeRequestsCount,
        feedback: socket.feedback,
        setFeedback: socket.setFeedback,
        setNowPlaying,
        setDuration,
        sendCommand: socket.sendCommand,
        showFeedback: socket.showFeedback,
        setPosition,
        setIsPaused,
        setIsSeeking,
        playheadAnchorRef,
        isMountedRef,
    };
}
