// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
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
        wsUrlWithTicket: vi.fn(),
    };
});

function noop(): void {
    // deliberate empty function
}

class MockWebSocket extends WebSocket {
    static instances: MockWebSocket[] = [];
    override readyState: number = MockWebSocket.CONNECTING;
    override send = vi.fn<(data: string) => void>();
    override close = vi.fn<() => void>(() => {
        this.readyState = MockWebSocket.CLOSED;
        if (this.onclose !== null) {
            this.onclose(new CloseEvent("close"));
        }
    });

    constructor(url: string) {
        super(url);
        MockWebSocket.instances.push(this);
    }
}

Object.defineProperty(globalThis, "WebSocket", {
    value: MockWebSocket,
    configurable: true,
    writable: true,
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

function openSocket(ctx: MusicSocketCtx): MockWebSocket {
    const socket = new MockWebSocket("ws://localhost/music");
    socket.readyState = MockWebSocket.OPEN;
    ctx.socketRef.current = socket;
    return socket;
}

function pendingId(ctx: MusicSocketCtx): string {
    const requestId = ctx.pendingRef.current.keys().next().value;
    if (requestId === undefined) throw new Error("expected a pending request");
    return requestId;
}

beforeEach(() => {
    vi.resetAllMocks();
    MockWebSocket.instances = [];
    vi.mocked(wsUrlWithTicket).mockResolvedValue("ws://localhost/music");
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe("dispatchMusicCommand", () => {
    it("rejects without touching the socket when disconnected or socket is null", async () => {
        const { ctx, setActiveRequestsCount, showFeedback } = mockCtx();

        await expect(dispatchMusicCommand(ctx, "pause")).rejects.toThrow(
            "Not connected to the bot."
        );

        expect(showFeedback).toHaveBeenCalledWith(false, "Not connected to the bot.");
        expect(setActiveRequestsCount).not.toHaveBeenCalled();
        expect(ctx.pendingRef.current.size).toBe(0);
    });

    it("rejects when the socket is in CONNECTING or CLOSED readyState", async () => {
        const { ctx, setActiveRequestsCount, showFeedback } = mockCtx();
        const socket = new MockWebSocket("ws://test");
        socket.readyState = MockWebSocket.CONNECTING;
        ctx.socketRef.current = socket;

        await expect(dispatchMusicCommand(ctx, "pause")).rejects.toThrow(
            "Not connected to the bot."
        );

        expect(showFeedback).toHaveBeenCalledWith(false, "Not connected to the bot.");
        expect(setActiveRequestsCount).not.toHaveBeenCalled();
    });

    it("sends the frame, increments active count, and resolves on ack", async () => {
        const { ctx, setActiveRequestsCount } = mockCtx();
        const socket = openSocket(ctx);

        const pending = dispatchMusicCommand(ctx, "pause", { track: 1 });
        expect(setActiveRequestsCount).toHaveBeenCalledTimes(1);
        const [callArg] = setActiveRequestsCount.mock.calls[0] ?? [];
        if (typeof callArg === "function") {
            expect(callArg(0)).toBe(1);
        }

        const [sent] = socket.send.mock.calls[0];
        if (typeof sent !== "string") throw new Error("expected a text frame");
        const frame: unknown = JSON.parse(sent);
        expect(frame).toMatchObject({ type: "music", action: "pause", track: 1 });

        routeIncomingFrame(
            { type: "ack", requestId: pendingId(ctx), ok: true, data: "done" },
            ctx,
            noop
        );

        await expect(pending).resolves.toBe("done");
        expect(ctx.pendingRef.current.size).toBe(0);
    });

    it("rejects when the socket send throws an Error instance", async () => {
        const { ctx, setActiveRequestsCount, showFeedback } = mockCtx();
        const socket = openSocket(ctx);
        const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
        socket.send.mockImplementationOnce(() => {
            throw new Error("boom");
        });

        await expect(dispatchMusicCommand(ctx, "pause")).rejects.toThrow("boom");

        expect(clearTimeoutSpy).toHaveBeenCalled();
        expect(showFeedback).toHaveBeenCalledWith(false, "Failed to transmit frame to server.");
        expect(setActiveRequestsCount).toHaveBeenCalledTimes(2);
        const [decArg] = setActiveRequestsCount.mock.calls[1] ?? [];
        if (typeof decArg === "function") {
            expect(decArg(1)).toBe(0);
            expect(decArg(0)).toBe(0);
        }
        expect(ctx.pendingRef.current.size).toBe(0);
    });

    it("rejects after ten seconds without an ack and updates active count", async () => {
        vi.useFakeTimers();
        const { ctx, showFeedback, setActiveRequestsCount } = mockCtx();
        openSocket(ctx);

        const assertion = expect(dispatchMusicCommand(ctx, "pause")).rejects.toThrow(
            "Command timed out."
        );
        await vi.advanceTimersByTimeAsync(10_000);
        await assertion;

        expect(showFeedback).toHaveBeenCalledWith(false, 'Command "pause" timed out.');
        expect(setActiveRequestsCount).toHaveBeenCalledTimes(2);
        const [decArg] = setActiveRequestsCount.mock.calls[1] ?? [];
        if (typeof decArg === "function") {
            expect(decArg(2)).toBe(1);
            expect(decArg(0)).toBe(0);
        }
        expect(ctx.pendingRef.current.size).toBe(0);
    });

    it("skips timeout reject logic if request was already settled before 10s", async () => {
        vi.useFakeTimers();
        const { ctx, showFeedback, setActiveRequestsCount } = mockCtx();
        openSocket(ctx);

        const pending = dispatchMusicCommand(ctx, "pause");
        const reqId = pendingId(ctx);

        // Resolve request before timeout
        routeIncomingFrame({ type: "ack", requestId: reqId, ok: true, data: "ok" }, ctx, noop);
        await expect(pending).resolves.toBe("ok");

        // Advance past 10s
        await vi.advanceTimersByTimeAsync(10_000);

        // showFeedback not called with timeout message
        expect(showFeedback).not.toHaveBeenCalledWith(false, 'Command "pause" timed out.');
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
            noop
        );

        expect(resolve).toHaveBeenCalledWith({ track: 2 });
        expect(reject).not.toHaveBeenCalled();
        expect(clearTimeoutSpy).toHaveBeenCalled();
        expect(ctx.pendingRef.current.has("r1")).toBe(false);
        expect(setActiveRequestsCount).toHaveBeenCalledTimes(1);
        const [decArg] = setActiveRequestsCount.mock.calls[0] ?? [];
        if (typeof decArg === "function") {
            expect(decArg(5)).toBe(4);
        }
    });

    it("rejects and shows feedback on a failed ack", () => {
        const { ctx, showFeedback } = mockCtx();
        const { resolve, reject } = plantRequest(ctx, "r1");

        routeIncomingFrame(
            { type: "ack", requestId: "r1", ok: false, error: "Nope" },
            ctx,
            noop
        );

        expect(resolve).not.toHaveBeenCalled();
        expect(reject).toHaveBeenCalledWith(new Error("Nope"));
        expect(showFeedback).toHaveBeenCalledWith(false, "Nope");
    });

    it("uses the default message when a failed ack carries no error", () => {
        const { ctx, showFeedback } = mockCtx();
        const { reject } = plantRequest(ctx, "r1");

        routeIncomingFrame({ type: "ack", requestId: "r1", ok: false }, ctx, noop);

        expect(reject).toHaveBeenCalledWith(new Error("Command failed."));
        expect(showFeedback).toHaveBeenCalledWith(false, "Command failed.");
    });

    it("ignores acks for unknown request ids", () => {
        const { ctx, setActiveRequestsCount, showFeedback } = mockCtx();
        const { resolve, reject } = plantRequest(ctx, "r1");
        const onNowPlaying = vi.fn();

        routeIncomingFrame({ type: "ack", requestId: "r2", ok: true }, ctx, onNowPlaying);

        expect(resolve).not.toHaveBeenCalled();
        expect(reject).not.toHaveBeenCalled();
        expect(onNowPlaying).not.toHaveBeenCalled();
        expect(showFeedback).not.toHaveBeenCalled();
        expect(setActiveRequestsCount).not.toHaveBeenCalled();
        expect(ctx.pendingRef.current.has("r1")).toBe(true);
    });

    it("ignores acks without a request id or empty string request id", () => {
        const { ctx } = mockCtx();
        const onNowPlaying = vi.fn();
        const { resolve, reject } = plantRequest(ctx, "");

        routeIncomingFrame({ type: "ack", ok: true }, ctx, onNowPlaying);
        routeIncomingFrame({ type: "ack", requestId: "", ok: true }, ctx, onNowPlaying);

        expect(resolve).not.toHaveBeenCalled();
        expect(reject).not.toHaveBeenCalled();
        expect(onNowPlaying).not.toHaveBeenCalled();
    });

    it("forwards nowPlaying events", () => {
        const { ctx } = mockCtx();
        const onNowPlaying = vi.fn();

        routeIncomingFrame(
            { type: "event", event: "nowPlaying", data: { title: "Song" } },
            ctx,
            onNowPlaying
        );

        expect(onNowPlaying).toHaveBeenCalledWith({ title: "Song" });
    });

    it("ignores other events and malformed frames", () => {
        const { ctx } = mockCtx();
        const onNowPlaying = vi.fn();

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
            noop
        );

        expect(resolve).toHaveBeenCalledWith("done");
        expect(setActiveRequestsCount).not.toHaveBeenCalled();
        expect(showFeedback).not.toHaveBeenCalled();
    });

    it("skips feedback for a failed ack after unmount", () => {
        const { ctx, setActiveRequestsCount, showFeedback } = mockCtx();
        ctx.isMountedRef.current = false;
        const { reject } = plantRequest(ctx, "r1");

        routeIncomingFrame(
            { type: "ack", requestId: "r1", ok: false, error: "Nope" },
            ctx,
            noop
        );

        expect(reject).toHaveBeenCalledWith(new Error("Nope"));
        expect(showFeedback).not.toHaveBeenCalled();
        expect(setActiveRequestsCount).not.toHaveBeenCalled();
    });
});

describe("useMusicSocket lifecycle and transport", () => {
    function stallTicket(): void {
        vi.mocked(wsUrlWithTicket).mockReturnValue(new Promise<string>(noop));
    }

    function renderSocket(): {
        result: { current: ReturnType<typeof useMusicSocket> };
        isMountedRef: { current: boolean };
    } {
        const isMountedRef = { current: true };
        const onNowPlayingRef = { current: noop };
        const rendered = renderHook(() => {
            return useMusicSocket({ guildId: "guild_123", isMountedRef, onNowPlayingRef });
        });
        return { result: rendered.result, isMountedRef };
    }

    it("starts connecting with no feedback", () => {
        stallTicket();
        const { result } = renderSocket();

        expect(result.current.status).toBe("connecting");
        expect(result.current.feedback).toBeNull();
        expect(result.current.activeRequestsCount).toBe(0);
    });

    it("shows feedback and auto-dismisses it with default 5000ms", () => {
        vi.useFakeTimers();
        stallTicket();
        const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
        const { result } = renderSocket();

        act(() => {
            result.current.showFeedback(true, "hi");
        });
        expect(result.current.feedback).toEqual({ ok: true, text: "hi" });
        // First showFeedback has no existing timer to clear
        expect(clearTimeoutSpy).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(4999);
        });
        expect(result.current.feedback).toEqual({ ok: true, text: "hi" });

        act(() => {
            vi.advanceTimersByTime(1);
        });
        expect(result.current.feedback).toBeNull();
    });

    it("does not clear feedback if component unmounts before auto-dismiss timer elapses", () => {
        vi.useFakeTimers();
        stallTicket();
        const { result, isMountedRef } = renderSocket();

        act(() => {
            result.current.showFeedback(true, "Stay", 5000);
        });
        expect(result.current.feedback).toEqual({ ok: true, text: "Stay" });

        // Unmount before 5s timer expires
        isMountedRef.current = false;
        act(() => {
            vi.advanceTimersByTime(5000);
        });

        // SetFeedback(null) skipped because unmounted
        expect(result.current.feedback).toEqual({ ok: true, text: "Stay" });
    });

    it("resets feedback timer when showFeedback is called repeatedly", () => {
        vi.useFakeTimers();
        stallTicket();
        const { result } = renderSocket();

        act(() => {
            result.current.showFeedback(true, "First", 5000);
        });
        act(() => {
            vi.advanceTimersByTime(3000);
        });
        act(() => {
            result.current.showFeedback(true, "Second", 5000);
        });
        act(() => {
            vi.advanceTimersByTime(3000);
        });
        expect(result.current.feedback).toEqual({ ok: true, text: "Second" });

        act(() => {
            vi.advanceTimersByTime(2000);
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

    it("marks disconnected when ticket request fails", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(noop);
        vi.mocked(wsUrlWithTicket).mockRejectedValueOnce(new Error("no ticket"));
        const isMountedRef = { current: true };

        const { result } = renderHook(() => {
            return useMusicSocket({
                guildId: "guild_123",
                isMountedRef,
                onNowPlayingRef: { current: noop },
            });
        });

        await waitFor(() => {
            expect(result.current.status).toBe("disconnected");
        });
        expect(consoleSpy).toHaveBeenCalledWith("Failed to obtain WS ticket:", expect.any(Error));
    });

    it("connects, sends nowPlaying on open, handles ack, and processes pushes", async () => {
        const onNowPlaying = vi.fn();
        const isMountedRef = { current: true };
        const onNowPlayingRef = { current: onNowPlaying };

        const { result } = renderHook(() => {
            return useMusicSocket({ guildId: "guild_123", isMountedRef, onNowPlayingRef });
        });

        await waitFor(() => {
            expect(MockWebSocket.instances.length).toBe(1);
        });
        const socket = MockWebSocket.instances[0];

        // 1. Socket opens -> sends "nowPlaying"
        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.(new Event("open"));
        });
        expect(result.current.status).toBe("connected");
        expect(socket.send).toHaveBeenCalled();

        // Check sent action was "nowPlaying" and route ACK back to resolve promise!
        const [sent] = socket.send.mock.calls[0];
        const parsed = JSON.parse(sent as string);
        expect(parsed.action).toBe("nowPlaying");

        act(() => {
            socket.onmessage?.(
                new MessageEvent("message", {
                    data: JSON.stringify({
                        type: "ack",
                        requestId: parsed.requestId,
                        ok: true,
                        data: { track: "Echoes Live" },
                    }),
                })
            );
        });

        await waitFor(() => {
            expect(onNowPlaying).toHaveBeenCalledWith({ track: "Echoes Live" });
        });

        // 2. Incoming server push event
        act(() => {
            socket.onmessage?.(
                new MessageEvent("message", {
                    data: JSON.stringify({
                        type: "event",
                        event: "nowPlaying",
                        data: { title: "Echoes" },
                    }),
                })
            );
            socket.onmessage?.(new MessageEvent("message", { data: "{malformed json" }));
            socket.onmessage?.(new MessageEvent("message", { data: 12345 }));

            if (socket.onmessage !== null) {
                Reflect.apply(socket.onmessage, socket, [new Event("message")]);
            }
        });
        expect(onNowPlaying).toHaveBeenCalledWith({ title: "Echoes" });

        // 3. Socket error closes socket
        act(() => {
            socket.onerror?.(new Event("error"));
        });
        expect(socket.close).toHaveBeenCalled();
    });

    it("rejects pending requests and reconnects with exponential backoff on close", async () => {
        vi.useFakeTimers();
        const isMountedRef = { current: true };
        const onNowPlayingRef = { current: noop };

        const { result } = renderHook(() => {
            return useMusicSocket({ guildId: "guild_123", isMountedRef, onNowPlayingRef });
        });

        await vi.advanceTimersByTimeAsync(0);
        expect(MockWebSocket.instances.length).toBe(1);
        const socket = MockWebSocket.instances[0];

        socket.readyState = MockWebSocket.OPEN;
        let commandRejectedReason: string | undefined;
        const sendPromise = result.current.sendCommand("play").catch((e: unknown) => {
            if (e instanceof Error) {
                commandRejectedReason = e.message;
            }
        });

        act(() => {
            socket.onclose?.(new CloseEvent("close"));
        });

        await sendPromise;

        expect(result.current.status).toBe("disconnected");
        expect(commandRejectedReason).toBe("Connection closed.");
        expect(result.current.activeRequestsCount).toBe(0);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1000);
        });
        expect(MockWebSocket.instances.length).toBe(2);

        const socket2 = MockWebSocket.instances[1];
        act(() => {
            socket2.onclose?.(new CloseEvent("close"));
        });

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1999);
        });
        expect(MockWebSocket.instances.length).toBe(2);

        await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
        });
        expect(MockWebSocket.instances.length).toBe(3);
    });

    it("cleans up active socket, clears reconnect timer, and rejects pending on unmount", async () => {
        vi.useFakeTimers();
        const isMountedRef = { current: true };

        const { result, unmount } = renderHook(() => {
            return useMusicSocket({
                guildId: "guild_123",
                isMountedRef,
                onNowPlayingRef: { current: noop },
            });
        });

        await vi.advanceTimersByTimeAsync(0);
        expect(MockWebSocket.instances.length).toBe(1);
        const socket = MockWebSocket.instances[0];
        socket.readyState = MockWebSocket.OPEN;

        let rejectReason: string | undefined;
        const sendPromise = result.current.sendCommand("play").catch((e: unknown) => {
            if (e instanceof Error) {
                rejectReason = e.message;
            }
        });

        unmount();
        await sendPromise;

        expect(socket.onclose).toBeNull();
        expect(socket.close).toHaveBeenCalled();
        expect(rejectReason).toBe("Component unmounted.");

        await act(async () => {
            await vi.runAllTimersAsync();
        });
        expect(MockWebSocket.instances.length).toBe(1);
    });

    it("does not call clearTimeout on teardown when reconnectTimer is null", () => {
        stallTicket();
        const clearTimeoutSpy = vi.spyOn(globalThis, "clearTimeout");
        const isMountedRef = { current: true };

        const { unmount } = renderHook(() => {
            return useMusicSocket({
                guildId: "guild_123",
                isMountedRef,
                onNowPlayingRef: { current: noop },
            });
        });

        unmount();

        // reconnectTimer was null, so clearTimeout should not be called during socket teardown
        expect(clearTimeoutSpy).not.toHaveBeenCalled();
    });

    it("handles non-Error objects and strings thrown during socket.send", async () => {
        const { ctx, showFeedback } = mockCtx();
        const socket = openSocket(ctx);

        // eslint-disable-next-line @typescript-eslint/only-throw-error
        // oxlint-disable-next-line typescript(only-throw-error)
        socket.send.mockImplementationOnce(() => {
            throw "string error";
        });
        await expect(dispatchMusicCommand(ctx, "pause")).rejects.toThrow("string error");

        // eslint-disable-next-line @typescript-eslint/only-throw-error
        // oxlint-disable-next-line typescript(only-throw-error)
        socket.send.mockImplementationOnce(() => {
            throw { foo: "bar" };
        });
        await expect(dispatchMusicCommand(ctx, "pause")).rejects.toThrow(
            "Failed to transmit frame to server."
        );
        expect(showFeedback).toHaveBeenCalledWith(false, "Failed to transmit frame to server.");
    });

    it("does not connect if isMountedRef is false when connect is called", () => {
        const isMountedRef = { current: false };
        renderHook(() => {
            return useMusicSocket({
                guildId: "guild_123",
                isMountedRef,
                onNowPlayingRef: { current: noop },
            });
        });

        expect(wsUrlWithTicket).not.toHaveBeenCalled();
    });

    it("does not create WebSocket if unmounted before ticket resolves", async () => {
        let resolveTicket: (url: string) => void = noop;
        vi.mocked(wsUrlWithTicket).mockReturnValue(new Promise((res) => { resolveTicket = res; }));
        const isMountedRef = { current: true };

        const { unmount } = renderHook(() => {
            return useMusicSocket({
                guildId: "guild_123",
                isMountedRef,
                onNowPlayingRef: { current: noop },
            });
        });

        isMountedRef.current = false;
        unmount();

        resolveTicket("ws://localhost/music");
        await Promise.resolve();

        expect(MockWebSocket.instances.length).toBe(0);
    });

    it("does not set connected status if unmounted before socket opens", async () => {
        const isMountedRef = { current: true };
        const onNowPlayingRef = { current: noop };

        const { result } = renderHook(() => {
            return useMusicSocket({
                guildId: "guild_123",
                isMountedRef,
                onNowPlayingRef,
            });
        });

        await waitFor(() => {
            expect(MockWebSocket.instances.length).toBe(1);
        });
        const socket = MockWebSocket.instances[0];

        isMountedRef.current = false;
        act(() => {
            socket.readyState = MockWebSocket.OPEN;
            socket.onopen?.(new Event("open"));
        });

        expect(result.current.status).not.toBe("connected");
    });

    it("does not schedule reconnect or update status if unmounted before close fires", async () => {
        vi.useFakeTimers();
        const isMountedRef = { current: true };
        const onNowPlayingRef = { current: noop };

        const { result } = renderHook(() => {
            return useMusicSocket({
                guildId: "guild_123",
                isMountedRef,
                onNowPlayingRef,
            });
        });

        await vi.advanceTimersByTimeAsync(0);
        expect(MockWebSocket.instances.length).toBe(1);
        const socket = MockWebSocket.instances[0];

        isMountedRef.current = false;
        act(() => {
            socket.onclose?.(new CloseEvent("close"));
        });

        expect(result.current.status).not.toBe("disconnected");

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(MockWebSocket.instances.length).toBe(1);
    });

    it("clears active reconnectTimer when unmounting during reconnect countdown", async () => {
        vi.useFakeTimers();
        const isMountedRef = { current: true };
        const onNowPlayingRef = { current: noop };

        const { unmount } = renderHook(() => {
            return useMusicSocket({
                guildId: "guild_123",
                isMountedRef,
                onNowPlayingRef,
            });
        });

        await vi.advanceTimersByTimeAsync(0);
        expect(MockWebSocket.instances.length).toBe(1);
        const socket = MockWebSocket.instances[0];

        // Trigger close to activate reconnectTimer
        act(() => {
            socket.onclose?.(new CloseEvent("close"));
        });

        unmount();

        await act(async () => {
            await vi.advanceTimersByTimeAsync(10_000);
        });
        expect(MockWebSocket.instances.length).toBe(1);
    });

    it("reconnects when guildId changes", async () => {
        const isMountedRef = { current: true };
        const onNowPlayingRef = { current: noop };

        const { rerender } = renderHook(
            ({ g }: { g: string }): ReturnType<typeof useMusicSocket> => {
                return useMusicSocket({
                    guildId: g,
                    isMountedRef,
                    onNowPlayingRef,
                });
            },
            { initialProps: { g: "guild_1" } }
        );

        await waitFor(() => {
            expect(MockWebSocket.instances.length).toBe(1);
        });

        rerender({ g: "guild_2" });

        await waitFor(() => {
            expect(MockWebSocket.instances.length).toBe(2);
        });
        expect(wsUrlWithTicket).toHaveBeenCalledWith("guild_2");
    });
});