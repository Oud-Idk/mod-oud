// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { Dispatch, SetStateAction } from "react";
import {
    dispatchMusicCommand,
    routeIncomingFrame,
    useMusicSocket,
    type MusicFeedback,
    type MusicSocketCtx,
} from "./useMusicSocket";
import type { ConnectionStatus, PendingRequest } from "./musicSocketProtocol";
import { wsUrlWithTicket } from "./musicSocketProtocol";

vi.mock("@/features/realtime/actions", () => ({
    issueRealtimeTicketAction: vi.fn(),
}));

vi.mock("./musicSocketProtocol", async (importOriginal) => {
    const actual = await importOriginal<typeof import("./musicSocketProtocol")>();
    return {
        ...actual,
        wsUrlWithTicket: vi.fn<() => Promise<string>>(),
    };
});

interface CtxHarness {
    ctx: MusicSocketCtx;
    setStatus: Mock<Dispatch<SetStateAction<ConnectionStatus>>>;
    setActiveRequestsCount: Mock<Dispatch<SetStateAction<number>>>;
    showFeedback: Mock<MusicFeedback>;
}

function mockCtx(): CtxHarness {
    const setStatus = vi.fn<Dispatch<SetStateAction<ConnectionStatus>>>();
    const setActiveRequestsCount = vi.fn<Dispatch<SetStateAction<number>>>();
    const showFeedback = vi.fn<MusicFeedback>();
    const ctx: MusicSocketCtx = {
        socketRef: { current: null },
        pendingRef: { current: new Map<string, PendingRequest>() },
        isMountedRef: { current: true },
        setStatus,
        setActiveRequestsCount,
        showFeedback,
    };
    return { ctx, setStatus, setActiveRequestsCount, showFeedback };
}

function plantRequest(
    ctx: MusicSocketCtx,
    requestId: string
): { resolve: Mock<(data: unknown) => void>; reject: Mock<(reason: Error) => void> } {
    const resolve = vi.fn<(data: unknown) => void>();
    const reject = vi.fn<(reason: Error) => void>();
    ctx.pendingRef.current.set(requestId, { resolve, reject, timeoutId: setTimeout(noop, 0) });
    return { resolve, reject };
}

function noop(): void {
    return;
}

// Node has no WebSocket server, so the open-socket half of dispatch runs on
// a real client pointed at a blackhole address. Only readyState is faked.
class OpenSocket extends WebSocket {
    constructor() {
        super("ws://10.255.255.1/music-test");
        this.onerror = () => undefined;
    }

    override get readyState(): number {
        return WebSocket.OPEN;
    }

    override send = vi.fn<(data: string | ArrayBufferLike | Blob | ArrayBufferView) => void>();
}

const openSockets: OpenSocket[] = [];

function openSocket(ctx: MusicSocketCtx): OpenSocket {
    const socket = new OpenSocket();
    ctx.socketRef.current = socket;
    openSockets.push(socket);
    return socket;
}

function pendingId(ctx: MusicSocketCtx): string {
    const requestId = ctx.pendingRef.current.keys().next().value;
    if (requestId === undefined) throw new Error("expected a pending request");
    return requestId;
}

beforeEach(() => {
    vi.resetAllMocks();
});

afterEach(() => {
    while (openSockets.length > 0) {
        const socket = openSockets.pop();
        if (socket !== undefined) socket.close();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("dispatchMusicCommand", () => {
    it("rejects without touching the socket when disconnected", async () => {
        const { ctx, setActiveRequestsCount, showFeedback } = mockCtx();

        await expect(dispatchMusicCommand(ctx, "pause")).rejects.toThrow(
            "Not connected to the bot."
        );

        expect(showFeedback).toHaveBeenCalledWith(false, "Not connected to the bot.");
        expect(setActiveRequestsCount).not.toHaveBeenCalled();
        expect(ctx.pendingRef.current.size).toBe(0);
    });

    it("sends the frame and resolves on ack", async () => {
        const { ctx } = mockCtx();
        const socket = openSocket(ctx);

        const pending = dispatchMusicCommand(ctx, "pause", { track: 1 });
        const [sent] = socket.send.mock.calls[0];
        if (typeof sent !== "string") throw new Error("expected a text frame");
        const frame: unknown = JSON.parse(sent);
        expect(frame).toMatchObject({ type: "music", action: "pause", track: 1 });

        routeIncomingFrame(
            { type: "ack", requestId: pendingId(ctx), ok: true, data: "done" },
            ctx,
            vi.fn<(data: unknown) => void>()
        );

        await expect(pending).resolves.toBe("done");
        expect(ctx.pendingRef.current.size).toBe(0);
    });

    it("rejects when the socket send throws", async () => {
        const { ctx, setActiveRequestsCount, showFeedback } = mockCtx();
        const socket = openSocket(ctx);
        socket.send.mockImplementationOnce(() => {
            throw new Error("boom");
        });

        await expect(dispatchMusicCommand(ctx, "pause")).rejects.toThrow("boom");

        expect(showFeedback).toHaveBeenCalledWith(false, "Failed to transmit frame to server.");
        expect(setActiveRequestsCount).toHaveBeenCalledTimes(2);
        expect(ctx.pendingRef.current.size).toBe(0);
    });

    it("rejects after ten seconds without an ack", async () => {
        vi.useFakeTimers();
        const { ctx, showFeedback } = mockCtx();
        openSocket(ctx);

        const assertion = expect(dispatchMusicCommand(ctx, "pause")).rejects.toThrow(
            "Command timed out."
        );
        await vi.advanceTimersByTimeAsync(10_000);
        await assertion;

        expect(showFeedback).toHaveBeenCalledWith(false, 'Command "pause" timed out.');
        expect(ctx.pendingRef.current.size).toBe(0);
    });

    it("still rejects on timeout after unmount but skips state updates", async () => {
        vi.useFakeTimers();
        const { ctx, setActiveRequestsCount, showFeedback } = mockCtx();
        ctx.isMountedRef.current = false;
        openSocket(ctx);

        const assertion = expect(dispatchMusicCommand(ctx, "pause")).rejects.toThrow(
            "Command timed out."
        );
        await vi.advanceTimersByTimeAsync(10_000);
        await assertion;

        expect(showFeedback).not.toHaveBeenCalled();
        expect(setActiveRequestsCount).toHaveBeenCalledTimes(1);
    });
});

describe("routeIncomingFrame", () => {
    it("resolves a matching ack and clears its timeout", () => {
        const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
        const { ctx, setActiveRequestsCount } = mockCtx();
        const { resolve, reject } = plantRequest(ctx, "r1");

        routeIncomingFrame(
            { type: "ack", requestId: "r1", ok: true, data: { track: 2 } },
            ctx,
            vi.fn<(data: unknown) => void>()
        );

        expect(resolve).toHaveBeenCalledWith({ track: 2 });
        expect(reject).not.toHaveBeenCalled();
        expect(clearTimeoutSpy).toHaveBeenCalled();
        expect(ctx.pendingRef.current.has("r1")).toBe(false);
        expect(setActiveRequestsCount).toHaveBeenCalledTimes(1);
    });

    it("rejects and shows feedback on a failed ack", () => {
        const { ctx, showFeedback } = mockCtx();
        const { resolve, reject } = plantRequest(ctx, "r1");

        routeIncomingFrame(
            { type: "ack", requestId: "r1", ok: false, error: "Nope" },
            ctx,
            vi.fn<(data: unknown) => void>()
        );

        expect(resolve).not.toHaveBeenCalled();
        expect(reject).toHaveBeenCalledWith(new Error("Nope"));
        expect(showFeedback).toHaveBeenCalledWith(false, "Nope");
    });

    it("uses the default message when a failed ack carries no error", () => {
        const { ctx, showFeedback } = mockCtx();
        const { reject } = plantRequest(ctx, "r1");

        routeIncomingFrame(
            { type: "ack", requestId: "r1", ok: false },
            ctx,
            vi.fn<(data: unknown) => void>()
        );

        expect(reject).toHaveBeenCalledWith(new Error("Command failed."));
        expect(showFeedback).toHaveBeenCalledWith(false, "Command failed.");
    });

    it("ignores acks for unknown request ids", () => {
        const { ctx, setActiveRequestsCount, showFeedback } = mockCtx();
        const { resolve, reject } = plantRequest(ctx, "r1");
        const onNowPlaying = vi.fn<(data: unknown) => void>();

        routeIncomingFrame({ type: "ack", requestId: "r2", ok: true }, ctx, onNowPlaying);

        expect(resolve).not.toHaveBeenCalled();
        expect(reject).not.toHaveBeenCalled();
        expect(onNowPlaying).not.toHaveBeenCalled();
        expect(showFeedback).not.toHaveBeenCalled();
        expect(setActiveRequestsCount).not.toHaveBeenCalled();
        expect(ctx.pendingRef.current.has("r1")).toBe(true);
    });

    it("ignores acks without a request id", () => {
        const { ctx } = mockCtx();
        const onNowPlaying = vi.fn<(data: unknown) => void>();

        routeIncomingFrame({ type: "ack", ok: true }, ctx, onNowPlaying);
        routeIncomingFrame({ type: "ack", requestId: "", ok: true }, ctx, onNowPlaying);

        expect(onNowPlaying).not.toHaveBeenCalled();
    });

    it("forwards nowPlaying events", () => {
        const { ctx } = mockCtx();
        const onNowPlaying = vi.fn<(data: unknown) => void>();

        routeIncomingFrame(
            { type: "event", event: "nowPlaying", data: { title: "Song" } },
            ctx,
            onNowPlaying
        );

        expect(onNowPlaying).toHaveBeenCalledWith({ title: "Song" });
    });

    it("ignores other events and malformed frames", () => {
        const { ctx } = mockCtx();
        const onNowPlaying = vi.fn<(data: unknown) => void>();

        routeIncomingFrame({ type: "event", event: "somethingElse" }, ctx, onNowPlaying);
        routeIncomingFrame({}, ctx, onNowPlaying);
        routeIncomingFrame("nope", ctx, onNowPlaying);
        routeIncomingFrame(null, ctx, onNowPlaying);

        expect(onNowPlaying).not.toHaveBeenCalled();
    });

    it("resolves without touching state after unmount", () => {
        const { ctx, setActiveRequestsCount, showFeedback } = mockCtx();
        ctx.isMountedRef.current = false;
        const { resolve } = plantRequest(ctx, "r1");

        routeIncomingFrame(
            { type: "ack", requestId: "r1", ok: true, data: "done" },
            ctx,
            vi.fn<(data: unknown) => void>()
        );

        expect(resolve).toHaveBeenCalledWith("done");
        expect(setActiveRequestsCount).not.toHaveBeenCalled();
        expect(showFeedback).not.toHaveBeenCalled();
    });
});

describe("useMusicSocket lifecycle", () => {
    function stallTicket(): void {
        vi.mocked(wsUrlWithTicket).mockReturnValue(new Promise<string>(() => undefined));
    }

    function renderSocket(): {
        result: { current: ReturnType<typeof useMusicSocket> };
        isMountedRef: { current: boolean };
    } {
        const isMountedRef = { current: true };
        const onNowPlayingRef = { current: (_data: unknown) => undefined };
        const rendered = renderHook(() =>
            useMusicSocket({ guildId: "guild_123", isMountedRef, onNowPlayingRef })
        );
        return { result: rendered.result, isMountedRef };
    }

    it("starts connecting with no feedback", () => {
        stallTicket();
        const { result } = renderSocket();

        expect(result.current.status).toBe("connecting");
        expect(result.current.feedback).toBeNull();
        expect(result.current.activeRequestsCount).toBe(0);
    });

    it("shows feedback and auto-dismisses it", () => {
        vi.useFakeTimers();
        stallTicket();
        const { result } = renderSocket();

        act(() => {
            result.current.showFeedback(true, "hi");
        });
        expect(result.current.feedback).toEqual({ ok: true, text: "hi" });

        act(() => {
            vi.advanceTimersByTime(5000);
        });
        expect(result.current.feedback).toBeNull();
    });

    it("keeps feedback when auto-dismiss is disabled", () => {
        vi.useFakeTimers();
        stallTicket();
        const { result } = renderSocket();

        act(() => {
            result.current.showFeedback(false, "hi", 0);
        });
        act(() => {
            vi.advanceTimersByTime(60_000);
        });

        expect(result.current.feedback).toEqual({ ok: false, text: "hi" });
    });

    it("ignores feedback after unmount", () => {
        stallTicket();
        const { result, isMountedRef } = renderSocket();
        isMountedRef.current = false;

        act(() => {
            result.current.showFeedback(true, "hi");
        });

        expect(result.current.feedback).toBeNull();
    });

    it("marks disconnected when the ticket request fails", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
        vi.mocked(wsUrlWithTicket).mockRejectedValue(new Error("no ticket"));
        const { result } = renderSocket();

        await waitFor(() => {
            expect(result.current.status).toBe("disconnected");
        });
        expect(consoleSpy).toHaveBeenCalled();
    });
});

describe("additional dispatch and route coverage", () => {
    it("rejects when the socket is not open", async () => {
        const { ctx, setActiveRequestsCount, showFeedback } = mockCtx();
        class ClosedSocket extends WebSocket {
            constructor() {
                super("ws://10.255.255.1/music-test");
            }

            override get readyState(): number {
                return WebSocket.CLOSED;
            }

            override send = vi.fn<(data: string | ArrayBufferLike | Blob | ArrayBufferView) => void>();
        }
        ctx.socketRef.current = new ClosedSocket();

        await expect(dispatchMusicCommand(ctx, "pause")).rejects.toThrow("Not connected to the bot.");

        expect(showFeedback).toHaveBeenCalledWith(false, "Not connected to the bot.");
        expect(setActiveRequestsCount).not.toHaveBeenCalled();
    });

    it("clears the timeout when transmission fails", async () => {
        const { ctx } = mockCtx();
        const socket = openSocket(ctx);
        const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
        socket.send.mockImplementationOnce(() => {
            throw new Error("boom");
        });

        await expect(dispatchMusicCommand(ctx, "pause")).rejects.toThrow("boom");

        expect(clearTimeoutSpy).toHaveBeenCalled();
    });

    it("does not resolve a pending request keyed by an empty id", () => {
        const { ctx } = mockCtx();
        const { resolve, reject } = plantRequest(ctx, "");

        routeIncomingFrame({ type: "ack", requestId: "", ok: true, data: "done" }, ctx, vi.fn());

        expect(resolve).not.toHaveBeenCalled();
        expect(reject).not.toHaveBeenCalled();
        expect(ctx.pendingRef.current.has("")).toBe(true);
    });

    it("skips feedback for a failed ack after unmount", () => {
        const { ctx, setActiveRequestsCount, showFeedback } = mockCtx();
        ctx.isMountedRef.current = false;
        const { reject } = plantRequest(ctx, "r1");

        routeIncomingFrame(
            { type: "ack", requestId: "r1", ok: false, error: "Nope" },
            ctx,
            vi.fn()
        );

        expect(reject).toHaveBeenCalledWith(new Error("Nope"));
        expect(showFeedback).not.toHaveBeenCalled();
        expect(setActiveRequestsCount).not.toHaveBeenCalled();
    });
});
