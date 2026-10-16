// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
    applyNowPlayingUpdate,
    useMusicConnection,
    type PlaybackStore,
} from "./useMusicConnection";
import { useMusicSocket } from "./useMusicSocket";
import type { ConnectionStatus, NowPlayingData } from "./musicSocketProtocol";
import type { MusicFeedback, MusicSendCommand } from "./useMusicSocket";

vi.mock("@/features/realtime/actions", () => ({
    issueRealtimeTicketAction: vi.fn(),
}));

vi.mock("./useMusicSocket", () => ({
    useMusicSocket: vi.fn(),
}));

interface StoreHarness {
    store: PlaybackStore;
    setNowPlaying: Mock<(value: SetStateAction<NowPlayingData | null>) => void>;
    setPosition: Mock<Dispatch<SetStateAction<number>>>;
    setDuration: Mock<Dispatch<SetStateAction<number>>>;
    setIsPaused: Mock<Dispatch<SetStateAction<boolean>>>;
    isMountedRef: RefObject<boolean>;
    playheadAnchorRef: RefObject<{ basePos: number; timestamp: number } | null>;
}

function mockStore(isSeeking = false): StoreHarness {
    const setNowPlaying = vi.fn<(value: SetStateAction<NowPlayingData | null>) => void>();
    const setPosition = vi.fn<Dispatch<SetStateAction<number>>>();
    const setDuration = vi.fn<Dispatch<SetStateAction<number>>>();
    const setIsPaused = vi.fn<Dispatch<SetStateAction<boolean>>>();
    const isMountedRef: RefObject<boolean> = { current: true };
    const playheadAnchorRef: RefObject<{ basePos: number; timestamp: number } | null> = {
        current: null,
    };
    return {
        store: {
            setNowPlaying,
            setPosition,
            setDuration,
            setIsPaused,
            isMountedRef,
            isSeeking,
            playheadAnchorRef,
        },
        setNowPlaying,
        setPosition,
        setDuration,
        setIsPaused,
        isMountedRef,
        playheadAnchorRef,
    };
}

function updaterResult(
    setNowPlaying: StoreHarness["setNowPlaying"],
    prev: NowPlayingData | null
): NowPlayingData | null {
    const [updater] = setNowPlaying.mock.calls[0];
    if (typeof updater !== "function") throw new Error("expected a state updater");
    return updater(prev);
}

beforeEach(() => {
    vi.resetAllMocks();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("applyNowPlayingUpdate", () => {
    it("does nothing when unmounted", () => {
        const { store, setNowPlaying, setPosition, setDuration, setIsPaused } = mockStore();
        store.isMountedRef.current = false;

        applyNowPlayingUpdate({ title: "Song" }, store);

        expect(setNowPlaying).not.toHaveBeenCalled();
        expect(setPosition).not.toHaveBeenCalled();
        expect(setDuration).not.toHaveBeenCalled();
        expect(setIsPaused).not.toHaveBeenCalled();
    });

    it.each([42, "nope", null, undefined])("resets state for an unparseable %j", (data) => {
        const { store, setNowPlaying, setPosition, setDuration, playheadAnchorRef } = mockStore();

        applyNowPlayingUpdate(data, store);

        expect(setNowPlaying).toHaveBeenCalledWith(null);
        expect(setPosition).toHaveBeenCalledWith(0);
        expect(setDuration).toHaveBeenCalledWith(0);
        expect(playheadAnchorRef.current).toBeNull();
    });

    it("resets state when the title is missing", () => {
        const { store, setNowPlaying, setPosition, setDuration } = mockStore();

        applyNowPlayingUpdate({}, store);

        expect(setNowPlaying).toHaveBeenCalledWith(null);
        expect(setPosition).toHaveBeenCalledWith(0);
        expect(setDuration).toHaveBeenCalledWith(0);
    });

    it("maps a full payload with snake_case fields", () => {
        const { store, setNowPlaying, setPosition, setDuration, setIsPaused, playheadAnchorRef } =
            mockStore();

        applyNowPlayingUpdate(
            {
                title: "Song",
                thumbnail: "thumb",
                requested_by: { name: "DJ" },
                duration: 180,
                position_sec: 10,
                is_paused: true,
                is_live: false,
            },
            store
        );

        expect(setIsPaused).toHaveBeenCalledWith(true);
        expect(updaterResult(setNowPlaying, null)).toEqual({
            title: "Song",
            thumbnail: "thumb",
            requestedBy: "DJ",
            durationSec: 180,
            positionSec: 10,
            isPaused: true,
            isLive: false,
        });
        expect(setDuration).toHaveBeenCalledWith(180);
        expect(setPosition).toHaveBeenCalledWith(10);
        expect(playheadAnchorRef.current?.basePos).toBe(10);
    });

    it("prefers metadata fields over top-level ones", () => {
        const { store, setNowPlaying } = mockStore();

        applyNowPlayingUpdate(
            {
                title: "Top",
                thumbnail: "top-thumb",
                duration: 60,
                metadata: { title: "Meta", thumbnail: "meta-thumb", duration: 90 },
            },
            store
        );

        expect(updaterResult(setNowPlaying, null)).toMatchObject({
            title: "Meta",
            thumbnail: "meta-thumb",
            durationSec: 90,
        });
    });

    it("prefers requested_by over requestedBy and keeps plain strings", () => {
        const first = mockStore();
        applyNowPlayingUpdate({ title: "A", requested_by: { name: "Snake" } }, first.store);
        expect(updaterResult(first.setNowPlaying, null)).toMatchObject({
            requestedBy: "Snake",
        });

        const second = mockStore();
        applyNowPlayingUpdate({ title: "B", requestedBy: "Solo" }, second.store);
        expect(updaterResult(second.setNowPlaying, null)).toMatchObject({
            requestedBy: "Solo",
        });
    });

    it("defaults position and flags for a bare title", () => {
        const { store, setNowPlaying, setPosition, setIsPaused } = mockStore();

        applyNowPlayingUpdate({ title: "X" }, store);

        expect(updaterResult(setNowPlaying, null)).toMatchObject({
            positionSec: 0,
            isPaused: false,
            isLive: false,
        });
        expect(setPosition).toHaveBeenCalledWith(0);
        expect(setIsPaused).toHaveBeenCalledWith(false);
    });

    it("keeps the previous duration when the new one is not positive", () => {
        const { store, setNowPlaying, setDuration } = mockStore();
        const prev: NowPlayingData = { title: "Old", durationSec: 100 };

        applyNowPlayingUpdate({ title: "New", duration: 0 }, store);

        expect(updaterResult(setNowPlaying, prev)?.durationSec).toBe(100);
        expect(setDuration).toHaveBeenCalledWith(0);
    });

    it("skips position and anchor while seeking", () => {
        const { store, setNowPlaying, setPosition, setDuration, playheadAnchorRef } =
            mockStore(true);

        applyNowPlayingUpdate({ title: "Song", duration: 120, position_sec: 30 }, store);

        expect(setNowPlaying).toHaveBeenCalled();
        expect(setDuration).toHaveBeenCalledWith(120);
        expect(setPosition).not.toHaveBeenCalled();
        expect(playheadAnchorRef.current).toBeNull();
    });
});

describe("useMusicConnection clocks", () => {
    function transport(status: ConnectionStatus, sendCommand?: MusicSendCommand): MusicSendCommand {
        const send =
            sendCommand ?? vi.fn<MusicSendCommand>().mockResolvedValue({ title: "T" });
        vi.mocked(useMusicSocket).mockReturnValue({
            status,
            feedback: null,
            setFeedback: vi.fn<Dispatch<SetStateAction<{ ok: boolean; text: string } | null>>>(),
            activeRequestsCount: 0,
            sendCommand: send,
            showFeedback: vi.fn<MusicFeedback>(),
        });
        return send;
    }

    it("polls nowPlaying every five seconds while connected", async () => {
        vi.useFakeTimers();
        const sendCommand = transport("connected");
        const { result } = renderHook(() => useMusicConnection({ guildId: "guild_123" }));

        expect(sendCommand).not.toHaveBeenCalled();
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(sendCommand).toHaveBeenCalledWith("nowPlaying");
        expect(result.current.nowPlaying?.title).toBe("T");
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(sendCommand).toHaveBeenCalledTimes(2);
    });

    it("stays silent while disconnected", () => {
        vi.useFakeTimers();
        const sendCommand = transport("disconnected");
        renderHook(() => useMusicConnection({ guildId: "guild_123" }));

        act(() => {
            vi.advanceTimersByTime(30_000);
        });

        expect(sendCommand).not.toHaveBeenCalled();
    });

    it("advances the playhead from the anchor", async () => {
        vi.useFakeTimers();
        transport("connected", vi.fn<MusicSendCommand>().mockResolvedValue({
            title: "T",
            duration: 100,
            position_sec: 10,
        }));
        const { result } = renderHook(() => useMusicConnection({ guildId: "guild_123" }));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(result.current.position).toBe(10);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        expect(result.current.position).toBe(11);
    });

    it("holds the playhead while paused", async () => {
        vi.useFakeTimers();
        transport(
            "connected",
            vi.fn<MusicSendCommand>().mockResolvedValue({ title: "T", is_paused: true })
        );
        const { result } = renderHook(() => useMusicConnection({ guildId: "guild_123" }));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        const held = result.current.position;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(result.current.position).toBe(held);
    });

    it("holds the playhead while seeking", async () => {
        vi.useFakeTimers();
        transport("connected");
        const { result } = renderHook(() => useMusicConnection({ guildId: "guild_123" }));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        act(() => {
            result.current.setIsSeeking(true);
        });
        const held = result.current.position;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        expect(result.current.position).toBe(held);
    });

    it("holds the playhead for live streams", async () => {
        vi.useFakeTimers();
        transport(
            "connected",
            vi.fn<MusicSendCommand>().mockResolvedValue({ title: "T", is_live: true })
        );
        const { result } = renderHook(() => useMusicConnection({ guildId: "guild_123" }));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(result.current.nowPlaying?.isLive).toBe(true);
        const held = result.current.position;
        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(result.current.position).toBe(held);
    });

    it("clamps at the duration and resyncs", async () => {
        vi.useFakeTimers();
        const sendCommand = transport(
            "connected",
            vi.fn<MusicSendCommand>().mockResolvedValue({ title: "T", duration: 100, position_sec: 99 })
        );
        const { result } = renderHook(() => useMusicConnection({ guildId: "guild_123" }));

        await act(async () => {
            await vi.advanceTimersByTimeAsync(5000);
        });
        expect(result.current.position).toBe(99);
        await act(async () => {
            await vi.advanceTimersByTimeAsync(2000);
        });
        expect(result.current.position).toBe(100);
        expect(sendCommand).toHaveBeenCalledTimes(2);
    });

    it("marks the mount flag false on unmount", () => {
        transport("connected");
        const { result, unmount } = renderHook(() => useMusicConnection({ guildId: "guild_123" }));

        expect(result.current.isMountedRef.current).toBe(true);
        unmount();
        expect(result.current.isMountedRef.current).toBe(false);
    });
});

describe("applyNowPlayingUpdate edge cases", () => {
    it("resets state for an empty title", () => {
        const { store, setNowPlaying, setPosition, setDuration } = mockStore();

        applyNowPlayingUpdate({ title: "" }, store);

        expect(setNowPlaying).toHaveBeenCalledWith(null);
        expect(setPosition).toHaveBeenCalledWith(0);
        expect(setDuration).toHaveBeenCalledWith(0);
    });

    it("defaults requestedBy to Web", () => {
        const { store, setNowPlaying } = mockStore();

        applyNowPlayingUpdate({ title: "Song" }, store);

        expect(updaterResult(setNowPlaying, null)?.requestedBy).toBe("Web");
    });

    it("maps camelCase payloads", () => {
        const { store, setNowPlaying, setPosition } = mockStore();

        applyNowPlayingUpdate(
            { title: "Song", requestedBy: "Solo", positionSec: 7, isPaused: true, isLive: true },
            store
        );

        const result = updaterResult(setNowPlaying, null);
        expect(result).toMatchObject({
            requestedBy: "Solo",
            positionSec: 7,
            isPaused: true,
            isLive: true,
        });
        expect(setPosition).toHaveBeenCalledWith(7);
    });

    describe("applyNowPlayingUpdate — missing branch coverage", () => {
        it("preserves previous thumbnail and requestedBy when omitted in update", () => {
            const { store, setNowPlaying } = mockStore();
            const prev: NowPlayingData = {
                title: "Old Song",
                thumbnail: "https://img.test/prev.png",
                requestedBy: "Alice",
                durationSec: 200,
            };

            // Incoming update only has a title
            applyNowPlayingUpdate({ title: "New Song" }, store);

            const updated = updaterResult(setNowPlaying, prev);
            expect(updated?.thumbnail).toBe("https://img.test/prev.png");
            expect(updated?.requestedBy).toBe("Alice");
        });

        it("parses durationSec from metadata and root item", () => {
            const metaStore = mockStore();
            applyNowPlayingUpdate(
                { title: "Song 1", metadata: { durationSec: "240" } },
                metaStore.store
            );
            expect(metaStore.setDuration).toHaveBeenCalledWith(240);

            const rootStore = mockStore();
            applyNowPlayingUpdate({ title: "Song 2", durationSec: 150 }, rootStore.store);
            expect(rootStore.setDuration).toHaveBeenCalledWith(150);
        });
    });


    describe("useMusicConnection edge cases", () => {
        function transport(
            status: ConnectionStatus,
            sendCommand?: MusicSendCommand
        ): MusicSendCommand {
            const send =
                sendCommand ?? vi.fn<MusicSendCommand>().mockResolvedValue({ title: "T" });
            vi.mocked(useMusicSocket).mockReturnValue({
                status,
                feedback: null,
                setFeedback: vi.fn<Dispatch<SetStateAction<{ ok: boolean; text: string } | null>>>(),
                activeRequestsCount: 0,
                sendCommand: send,
                showFeedback: vi.fn<MusicFeedback>(),
            });
            return send;
        }

        it("clears the heartbeat interval on unmount", async () => {
            vi.useFakeTimers();
            const sendCommand = transport("connected");
            const { unmount } = renderHook(() => useMusicConnection({ guildId: "guild_123" }));

            await act(async () => {
                await vi.advanceTimersByTimeAsync(5000);
            });
            expect(sendCommand).toHaveBeenCalledTimes(1);

            unmount();

            // Advance further; if clearInterval was omitted, sendCommand would be called again
            await act(async () => {
                await vi.advanceTimersByTimeAsync(15000);
            });
            expect(sendCommand).toHaveBeenCalledTimes(1);
        });

        it("resyncs with the exact command 'nowPlaying' when reaching duration", async () => {
            vi.useFakeTimers();
            const sendCommand = transport(
                "connected",
                vi.fn<MusicSendCommand>().mockResolvedValue({ title: "T", duration: 10, position_sec: 9 })
            );
            const { result } = renderHook(() => useMusicConnection({ guildId: "guild_123" }));

            await act(async () => {
                await vi.advanceTimersByTimeAsync(5000);
            });
            expect(result.current.position).toBe(9);

            await act(async () => {
                await vi.advanceTimersByTimeAsync(2000);
            });
            expect(result.current.position).toBe(10);
            expect(sendCommand).toHaveBeenNthCalledWith(2, "nowPlaying");
        });

        it("strictly prevents playhead progression during live streams between heartbeats", async () => {
            vi.useFakeTimers();
            transport(
                "connected",
                vi.fn<MusicSendCommand>().mockResolvedValue({ title: "Live", is_live: true, position_sec: 0 })
            );
            const { result } = renderHook(() => useMusicConnection({ guildId: "guild_123" }));

            // Initial sync
            await act(async () => {
                await vi.advanceTimersByTimeAsync(5000);
            });
            expect(result.current.nowPlaying?.isLive).toBe(true);
            expect(result.current.position).toBe(0);

            // Advance by 1500ms (before the 5s heartbeat fires and resets state)
            await act(async () => {
                await vi.advanceTimersByTimeAsync(1500);
            });
            // If line 125 was mutated to false, the interval would have ticked to 1
            expect(result.current.position).toBe(0);
        });

        it("initializes isPaused to false by default", () => {
            transport("disconnected");
            const { result } = renderHook(() => useMusicConnection({ guildId: "guild_123" }));
            expect(result.current.isPaused).toBe(false);
        });

        it("passes guildId, isMountedRef, and onNowPlayingRef to useMusicSocket", () => {
            transport("connected");
            renderHook(() => useMusicConnection({ guildId: "guild_xyz" }));

            const calls = vi.mocked(useMusicSocket).mock.calls;
            const lastCall = calls[calls.length - 1];
            expect(lastCall).toBeDefined();

            const [options] = lastCall;
            expect(options.guildId).toBe("guild_xyz");
            expect(options.isMountedRef.current).toBe(true);
            expect(typeof options.onNowPlayingRef.current).toBe("function");
        });

        it("does not run playhead clock when status is connecting even if nowPlaying data exists", async () => {
            vi.useFakeTimers();
            transport("connecting");
            const { result } = renderHook(() => useMusicConnection({ guildId: "guild_123" }));

            act(() => {
                result.current.setNowPlaying({
                    title: "Track",
                    durationSec: 100,
                    positionSec: 10,
                    isLive: false,
                });
                result.current.setDuration(100);
                result.current.setPosition(10);
                result.current.playheadAnchorRef.current = {
                    basePos: 10,
                    timestamp: performance.now(),
                };
            });

            await act(async () => {
                await vi.advanceTimersByTimeAsync(2000);
            });

            // Position must not have advanced because status is "connecting"
            expect(result.current.position).toBe(10);
        });

        it("keeps updateNowPlayingStateRef synced when seeking status updates", () => {
            transport("connected");
            let capturedOnNowPlaying: ((data: unknown) => void) | undefined;
            vi.mocked(useMusicSocket).mockImplementation(({ onNowPlayingRef }) => {
                capturedOnNowPlaying = (data: unknown) => { onNowPlayingRef.current(data) };
                return {
                    status: "connected",
                    feedback: null,
                    setFeedback: vi.fn(),
                    activeRequestsCount: 0,
                    sendCommand: vi.fn().mockResolvedValue({ title: "T" }),
                    showFeedback: vi.fn(),
                };
            });

            const { result } = renderHook(() => useMusicConnection({ guildId: "guild_123" }));

            // Toggle isSeeking to true (which changes updateNowPlayingState callback)
            act(() => {
                result.current.setIsSeeking(true);
            });

            // Trigger socket update with new position while seeking
            act(() => {
                capturedOnNowPlaying?.({
                    title: "Song",
                    duration: 100,
                    position_sec: 50,
                });
            });

            // Position should remain 0 because isSeeking is true in the updated ref
            expect(result.current.position).toBe(0);
        });
    });
});
