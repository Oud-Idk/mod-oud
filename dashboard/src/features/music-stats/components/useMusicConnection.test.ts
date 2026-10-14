import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Dispatch, RefObject, SetStateAction } from "react";
import {
    applyNowPlayingUpdate,
    type PlaybackStore,
} from "./useMusicConnection";
import type { NowPlayingData } from "./musicSocketProtocol";

vi.mock("@/features/realtime/actions", () => ({
    issueRealtimeTicketAction: vi.fn(),
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
