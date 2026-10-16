// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, renderHook, waitFor } from "@testing-library/react";
import {
    buildNewSSELogEntry,
    normalizeSSEUsernames,
    sseLogPayloadSchema,
    useSSEInfiniteScroll,
    type UseMessageLogViewerProps,
} from "./useSSEInfiniteScroll";
import { issueRealtimeTicketAction } from "@/features/realtime/actions";

// --- Mocks Setup ---
vi.mock("@/config", () => ({
    config: { publicBackendUrl: "https://backend.test" },
}));

vi.mock("@/features/realtime/actions", () => ({
    issueRealtimeTicketAction: vi.fn(),
}));

function noop(): void {
    // deliberate empty function
}

class MockEventSource {
    static instances: MockEventSource[] = [];
    url: string;
    onopen: (() => void) | null = null;
    onerror: ((err: Event) => void) | null = null;
    listeners: Record<string, ((event: Event) => void)[]> = {};
    closed = false;

    constructor(url: string) {
        this.url = url;
        MockEventSource.instances.push(this);
    }

    addEventListener(type: string, cb: (event: Event) => void): void {
        const list = this.listeners[type] ?? [];
        list.push(cb);
        this.listeners[type] = list;
    }

    removeEventListener(type: string, cb: (event: Event) => void): void {
        const list = this.listeners[type] ?? [];
        this.listeners[type] = list.filter((l) => l !== cb);
    }

    close(): void {
        this.closed = true;
    }

    emit(type: string, event: Event): void {
        const list = this.listeners[type] ?? [];
        for (const cb of list) {
            cb(event);
        }
    }
}

class MockIntersectionObserver implements IntersectionObserver {
    static instances: MockIntersectionObserver[] = [];
    callback: IntersectionObserverCallback;
    options?: IntersectionObserverInit;
    observedTargets: Element[] = [];

    readonly root: Element | Document | null = null;
    readonly rootMargin: string = "";
    readonly thresholds: readonly number[] = [];

    constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.callback = callback;
        this.options = options;
        MockIntersectionObserver.instances.push(this);
    }

    observe(el: Element): void {
        this.observedTargets.push(el);
    }

    unobserve(el: Element): void {
        this.observedTargets = this.observedTargets.filter((t) => t !== el);
    }

    disconnect(): void {
        this.observedTargets = [];
    }

    takeRecords(): IntersectionObserverEntry[] {
        return [];
    }

    triggerIntersect(isIntersecting: boolean): void {
        const rect: DOMRectReadOnly = new DOMRectReadOnly();
        const entry: IntersectionObserverEntry = {
            isIntersecting,
            boundingClientRect: rect,
            intersectionRatio: isIntersecting ? 1 : 0,
            intersectionRect: rect,
            rootBounds: null,
            target: document.createElement("div"),
            time: Date.now(),
        };
        this.callback([entry], this);
    }
}

Object.defineProperty(globalThis, "EventSource", {
    value: MockEventSource,
    configurable: true,
    writable: true,
});
Object.defineProperty(globalThis, "IntersectionObserver", {
    value: MockIntersectionObserver,
    configurable: true,
    writable: true,
});

describe("sseLogPayloadSchema", () => {
    it("parses valid payloads, converts date strings, and supports nullables", () => {
        const parsed = sseLogPayloadSchema.parse({
            id: 123,
            guild_id: "g1",
            deleted_by_id: null,
            deleted_by_name: null,
            attachment_url: null,
            created_at: "2025-01-01T00:00:00Z",
            extra_field: "survives_loose",
        });

        expect(parsed.id).toBe(123);
        expect(parsed.guild_id).toBe("g1");
        expect(parsed.deleted_by_id).toBeNull();
        expect(parsed.deleted_by_name).toBeNull();
        expect(parsed.attachment_url).toBeNull();
        expect(parsed.created_at).toBeInstanceOf(Date);
        const record: Record<string, unknown> = parsed;
        expect(record.extra_field).toBe("survives_loose");
    });
});

describe("normalizeSSEUsernames", () => {
    it("should return empty object when all username fields are omitted", () => {
        expect(normalizeSSEUsernames({})).toEqual({});
    });

    it("normalizes author fields correctly and respects precedence", () => {
        expect(normalizeSSEUsernames({ author_name: "Alice" })).toEqual({
            author_username: "Alice",
        });
        expect(normalizeSSEUsernames({ author_username: "AliceFallback" })).toEqual({
            author_username: "AliceFallback",
        });
        expect(normalizeSSEUsernames({ author_name: "Alice", author_username: "Ignore" })).toEqual({
            author_username: "Alice",
        });
    });

    it("normalizes reporter fields correctly and respects precedence", () => {
        expect(normalizeSSEUsernames({ reporter_name: "Bob" })).toEqual({
            reporter_username: "Bob",
        });
        expect(normalizeSSEUsernames({ reporter_username: "BobFallback" })).toEqual({
            reporter_username: "BobFallback",
        });
        expect(normalizeSSEUsernames({ reporter_name: "Bob", reporter_username: "Ignore" })).toEqual({
            reporter_username: "Bob",
        });
    });

    it("normalizes deleted_by fields correctly and respects precedence", () => {
        expect(normalizeSSEUsernames({ deleted_by_name: "Mod" })).toEqual({
            deleted_by_username: "Mod",
        });
        expect(normalizeSSEUsernames({ deleted_by_username: "ModFallback" })).toEqual({
            deleted_by_username: "ModFallback",
        });
        expect(normalizeSSEUsernames({ deleted_by_name: "Mod", deleted_by_username: "Ignore" })).toEqual({
            deleted_by_username: "Mod",
        });
    });
});

describe("buildNewSSELogEntry", () => {
    it("should provide safe defaults for completely empty payload", () => {
        const now = new Date("2026-01-01T00:00:00Z");
        vi.useFakeTimers();
        vi.setSystemTime(now);

        const entry = buildNewSSELogEntry({}, 42, "default_guild");

        expect(entry.id).toBe(42);
        expect(entry.guild_id).toBe("default_guild");
        expect(entry.status).toBe("UNDER_REVIEW");
        expect(entry.attachment_url).toBeNull();
        expect(entry.created_at).toEqual(now);
        expect(entry.deleted_at).toEqual(now);
        expect(entry.updated_at).toEqual(now);
        expect(entry.author_username).toBe("");
        expect(entry.reporter_username).toBe("");
        expect(entry.deleted_by_username).toBe("");

        vi.useRealTimers();
    });

    it("passes through core metadata fields cleanly", () => {
        const entry = buildNewSSELogEntry(
            {
                channel_id: "chan_9",
                message_id: "msg_9",
                author_id: "auth_9",
                reporter_id: "rep_9",
                reason: "rule_violation",
                status: "CUSTOM_STATUS",
                attachment_url: "https://file.png",
            },
            10,
            "guild_1"
        );

        expect(entry.channel_id).toBe("chan_9");
        expect(entry.message_id).toBe("msg_9");
        expect(entry.author_id).toBe("auth_9");
        expect(entry.reporter_id).toBe("rep_9");
        expect(entry.reason).toBe("rule_violation");
        expect(entry.status).toBe("CUSTOM_STATUS");
        expect(entry.attachment_url).toBe("https://file.png");
    });

    it("prefers explicit timestamps when provided", () => {
        const created = new Date("2025-01-01");
        const deleted = new Date("2025-01-02");
        const updated = new Date("2025-01-03");

        const entry = buildNewSSELogEntry(
            { created_at: created, deleted_at: deleted, updated_at: updated },
            10,
            "g"
        );

        expect(entry.created_at).toBe(created);
        expect(entry.deleted_at).toBe(deleted);
        expect(entry.updated_at).toBe(updated);
    });

    it("falls back deleted_at and updated_at to created_at if only created_at is provided", () => {
        const created = new Date("2025-05-01");
        const entry = buildNewSSELogEntry({ created_at: created }, 10, "g");

        expect(entry.created_at).toBe(created);
        expect(entry.deleted_at).toBe(created);
        expect(entry.updated_at).toBe(created);
    });

    it("prefers message_content when content is not present", () => {
        const entry = buildNewSSELogEntry({ message_content: "fallback message" }, 10, "g");
        expect(entry.message_content).toBe("fallback message");
    });

    it("maps content to message_content when content is provided", () => {
        const entry = buildNewSSELogEntry({ content: "primary content" }, 10, "g");
        expect(entry.message_content).toBe("primary content");
    });
});

interface LogItem {
    id: number;
    content?: string;
}

describe("useSSEInfiniteScroll hook", () => {
    const mockTicket = { userId: "user_99", expires: 12345, sig: "valid_sig", guildId: "guild_123" };
    const defaultProps: UseMessageLogViewerProps<LogItem> = {
        guildId: "guild_123",
        eventName: "message_delete",
        fetchMoreAction: vi.fn<() => Promise<LogItem[]>>().mockResolvedValue([]),
    };

    function TestConsumer(props: UseMessageLogViewerProps<LogItem>): React.JSX.Element {
        const hook = useSSEInfiniteScroll<LogItem>(props);
        return (
            <div>
                <div ref={hook.observerTarget} data-testid="observer-target" />
                <span data-testid="status">{hook.status}</span>
                <span data-testid="log-count">{hook.logs.length}</span>
                <span data-testid="has-more">{String(hook.hasMore)}</span>
                <span data-testid="is-loading">{String(hook.isLoadingMore)}</span>
            </div>
        );
    }

    beforeEach(() => {
        vi.clearAllMocks();
        MockEventSource.instances = [];
        MockIntersectionObserver.instances = [];
        vi.mocked(issueRealtimeTicketAction).mockResolvedValue(mockTicket);
        vi.spyOn(console, "error").mockImplementation(noop);
    });

    afterEach(() => {
        cleanup();
        vi.restoreAllMocks();
    });

    it("defaults initialHistory to empty array when omitted", () => {
        const { result } = renderHook(() => {
            return useSSEInfiniteScroll({
                guildId: "guild_123",
                eventName: "message_delete",
                fetchMoreAction: vi.fn<() => Promise<LogItem[]>>().mockResolvedValue([]),
            });
        });
        expect(result.current.logs).toEqual([]);
        expect(result.current.hasMore).toBe(false);
    });

    it("handles boundary for initialHistory >= 10: 9 items is false, 10 items is true", () => {
        const { result: nineResult } = renderHook(() => {
            return useSSEInfiniteScroll({
                ...defaultProps,
                initialHistory: Array.from({ length: 9 }, (_, i) => ({ id: i })),
            });
        });
        expect(nineResult.current.hasMore).toBe(false);

        const { result: tenResult } = renderHook(() => {
            return useSSEInfiniteScroll({
                ...defaultProps,
                initialHistory: Array.from({ length: 10 }, (_, i) => ({ id: i })),
            });
        });
        expect(tenResult.current.hasMore).toBe(true);
    });

    it("skips observer creation if observerTarget is null (never attached to DOM)", () => {
        renderHook(() => {
            useSSEInfiniteScroll(defaultProps);
        });
        expect(MockIntersectionObserver.instances.length).toBe(0);
    });

    it("initializes with correct default states and configures observer threshold", () => {
        const { getByTestId } = render(<TestConsumer {...defaultProps} initialHistory={[{ id: 1 }]} />);

        expect(getByTestId("status").textContent).toBe("CONNECTING");
        expect(getByTestId("is-loading").textContent).toBe("false");

        const observer = MockIntersectionObserver.instances[0];
        expect(observer.options?.threshold).toBe(0.1);
    });

    it("connects to SSE with exact signed query parameters and updates status on open", async () => {
        const { getByTestId } = render(<TestConsumer {...defaultProps} />);

        await waitFor(() => {
            expect(issueRealtimeTicketAction).toHaveBeenCalledWith("guild_123", "sse");
            expect(MockEventSource.instances.length).toBe(1);
        });

        const es = MockEventSource.instances[0];
        const url = new URL(es.url);
        expect(url.origin + url.pathname).toBe("https://backend.test/api/sse/events");
        expect(url.searchParams.get("guild_id")).toBe("guild_123");
        expect(url.searchParams.get("user_id")).toBe("user_99");
        expect(url.searchParams.get("expires")).toBe("12345");
        expect(url.searchParams.get("sig")).toBe("valid_sig");

        act(() => {
            es.onopen?.();
        });

        expect(getByTestId("status").textContent).toBe("CONNECTED");
    });

    it("aborts connection setup if unmounted before ticket resolves", async () => {
        let resolveTicket: (val: typeof mockTicket) => void = noop;
        vi.mocked(issueRealtimeTicketAction).mockReturnValue(
            new Promise((res) => {
                resolveTicket = res;
            })
        );

        const { unmount } = render(<TestConsumer {...defaultProps} />);
        unmount();

        resolveTicket(mockTicket);
        await Promise.resolve();

        expect(MockEventSource.instances.length).toBe(0);
    });

    it("handles connection error during setup and sets status to DISCONNECTED", async () => {
        const err = new Error("Network fail");
        vi.mocked(issueRealtimeTicketAction).mockRejectedValueOnce(err);
        const { getByTestId } = render(<TestConsumer {...defaultProps} />);

        await waitFor(() => {
            expect(getByTestId("status").textContent).toBe("DISCONNECTED");
            expect(console.error).toHaveBeenCalledWith(
                "Failed to initialize SSE connection for message_delete:",
                err
            );
        });
    });

    it("logs error and disconnects when eventSource.onerror triggers", async () => {
        const { getByTestId } = render(<TestConsumer {...defaultProps} />);

        await waitFor(() => {
            expect(MockEventSource.instances.length).toBe(1);
        });
        const es = MockEventSource.instances[0];
        const errorEvent = new Event("error");

        act(() => {
            es.onerror?.(errorEvent);
        });

        expect(console.error).toHaveBeenCalledWith("SSE message_delete channel error:", errorEvent);
        expect(getByTestId("status").textContent).toBe("DISCONNECTED");
    });

    it("reconnects with new ticket when guildId changes", async () => {
        const { rerender } = render(<TestConsumer {...defaultProps} guildId="guild_1" />);

        await waitFor(() => {
            expect(MockEventSource.instances.length).toBe(1);
        });
        const es1 = MockEventSource.instances[0];

        rerender(<TestConsumer {...defaultProps} guildId="guild_2" />);

        await waitFor(() => {
            expect(MockEventSource.instances.length).toBe(2);
        });
        expect(es1.closed).toBe(true);
        const es2 = MockEventSource.instances[1];
        expect(es2.url).toContain("guild_id=guild_2");
    });

    it("falls back to Date.now() when incoming SSE ID is missing or NaN", async () => {
        const now = 99999999;
        vi.spyOn(Date, "now").mockReturnValue(now);

        const { result } = renderHook(() => {
            return useSSEInfiniteScroll({ ...defaultProps, initialHistory: [{ id: 1 }] });
        });

        await waitFor(() => {
            expect(MockEventSource.instances.length).toBe(1);
        });
        const es = MockEventSource.instances[0];

        act(() => {
            es.emit(
                "message_delete",
                new MessageEvent("message_delete", {
                    data: JSON.stringify({ content: "no id" }),
                })
            );
        });
        expect(result.current.logs[0]?.id).toBe(now);

        act(() => {
            es.emit(
                "message_delete",
                new MessageEvent("message_delete", {
                    data: JSON.stringify({ id: "invalid_nan", content: "nan id" }),
                })
            );
        });
        expect(result.current.logs[0]?.id).toBe(now);
    });

    it("updates matching log in-place without disturbing others or order", async () => {
        const initial = [
            { id: 1, content: "first" },
            { id: 2, content: "second" },
            { id: 3, content: "third" },
        ];

        const { result } = renderHook(() => {
            return useSSEInfiniteScroll({ ...defaultProps, initialHistory: initial });
        });

        await waitFor(() => {
            expect(MockEventSource.instances.length).toBe(1);
        });
        const es = MockEventSource.instances[0];

        act(() => {
            es.emit(
                "message_delete",
                new MessageEvent("message_delete", {
                    data: JSON.stringify({ id: 2, content: "second updated" }),
                })
            );
        });

        expect(result.current.logs).toHaveLength(3);
        expect(result.current.logs[0]).toEqual({ id: 1, content: "first" });
        expect(result.current.logs[1]?.content).toBe("second updated");
        expect(result.current.logs[2]).toEqual({ id: 3, content: "third" });
    });

    it("logs console.error on invalid JSON or invalid SSE schema payload", async () => {
        renderHook(() => {
            useSSEInfiniteScroll({ ...defaultProps, initialHistory: [{ id: 1 }] });
        });

        await waitFor(() => {
            expect(MockEventSource.instances.length).toBe(1);
        });
        const es = MockEventSource.instances[0];

        act(() => {
            es.emit("message_delete", new MessageEvent("message_delete", { data: "{bad json" }));
        });
        expect(console.error).toHaveBeenCalledWith(
            "Error parsing message_delete SSE event:",
            expect.any(SyntaxError)
        );

        act(() => {
            es.emit(
                "message_delete",
                new MessageEvent("message_delete", { data: JSON.stringify({ guild_id: true }) })
            );
        });
        expect(console.error).toHaveBeenCalledWith(
            "Invalid SSE payload for message_delete:",
            expect.anything()
        );
    });

    it("fetches using the oldest log's id (last item in array)", () => {
        const fetchMoreAction = vi.fn<() => Promise<LogItem[]>>().mockResolvedValue([]);
        const history = [
            ...Array.from({ length: 9 }, (_, i) => ({ id: 100 - i })),
            { id: 10 },
        ];

        render(
            <TestConsumer
                {...defaultProps}
                initialHistory={history}
                fetchMoreAction={fetchMoreAction}
            />
        );

        const observer = MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1];
        act(() => {
            observer.triggerIntersect(true);
        });

        expect(fetchMoreAction).toHaveBeenCalledWith("guild_123", 10);
    });

    it("prevents concurrent fetches when isLoadingMore is true", async () => {
        let resolvePromise: (val: LogItem[]) => void = noop;
        const fetchMoreAction = vi.fn<() => Promise<LogItem[]>>().mockReturnValue(
            new Promise((res) => {
                resolvePromise = res;
            })
        );

        const { getByTestId } = render(
            <TestConsumer
                {...defaultProps}
                initialHistory={Array.from({ length: 10 }, (_, i) => ({ id: i }))}
                fetchMoreAction={fetchMoreAction}
            />
        );

        act(() => {
            const observer = MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1];
            observer.triggerIntersect(true);
        });
        expect(fetchMoreAction).toHaveBeenCalledTimes(1);

        await waitFor(() => {
            expect(getByTestId("is-loading").textContent).toBe("true");
        });

        act(() => {
            const observer = MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1];
            observer.triggerIntersect(true);
        });
        expect(fetchMoreAction).toHaveBeenCalledTimes(1);

        act(() => {
            resolvePromise([]);
        });
    });

    it("does not load more logs when observer intersection is false", () => {
        const fetchMoreAction = vi.fn<() => Promise<LogItem[]>>();
        render(
            <TestConsumer
                {...defaultProps}
                initialHistory={Array.from({ length: 10 }, (_, i) => ({ id: i }))}
                fetchMoreAction={fetchMoreAction}
            />
        );

        const observer = MockIntersectionObserver.instances[0];
        act(() => {
            observer.triggerIntersect(false);
        });

        expect(fetchMoreAction).not.toHaveBeenCalled();
    });

    it("does not load more logs if hasMore is false or logs are empty", () => {
        const fetchMoreAction = vi.fn<() => Promise<LogItem[]>>();
        render(
            <TestConsumer
                {...defaultProps}
                initialHistory={[]}
                fetchMoreAction={fetchMoreAction}
            />
        );

        const observer = MockIntersectionObserver.instances[0];
        act(() => {
            observer.triggerIntersect(true);
        });

        expect(fetchMoreAction).not.toHaveBeenCalled();
    });

    it("handles returning fewer than 10 logs: sets hasMore = false", async () => {
        const fetchMoreAction = vi.fn<() => Promise<LogItem[]>>().mockResolvedValue(
            Array.from({ length: 9 }, (_, i) => ({ id: i + 100 }))
        );

        const { getByTestId } = render(
            <TestConsumer
                {...defaultProps}
                initialHistory={Array.from({ length: 10 }, (_, i) => ({ id: i }))}
                fetchMoreAction={fetchMoreAction}
            />
        );

        const observer = MockIntersectionObserver.instances[0];
        act(() => {
            observer.triggerIntersect(true);
        });

        await waitFor(() => {
            expect(getByTestId("has-more").textContent).toBe("false");
            expect(getByTestId("log-count").textContent).toBe("19");
        });
    });

    it("keeps hasMore = true when exactly 10 older logs are returned", async () => {
        const tenLogs = Array.from({ length: 10 }, (_, i) => ({ id: i + 100 }));
        const fetchMoreAction = vi.fn<() => Promise<LogItem[]>>().mockResolvedValue(tenLogs);

        const { getByTestId } = render(
            <TestConsumer
                {...defaultProps}
                initialHistory={Array.from({ length: 10 }, (_, i) => ({ id: i }))}
                fetchMoreAction={fetchMoreAction}
            />
        );

        const observer = MockIntersectionObserver.instances[0];
        act(() => {
            observer.triggerIntersect(true);
        });

        await waitFor(() => {
            expect(getByTestId("has-more").textContent).toBe("true");
            expect(getByTestId("log-count").textContent).toBe("20");
        });
    });

    it("cleans up EventSource and observer on unmount", async () => {
        const { unmount } = render(<TestConsumer {...defaultProps} />);

        await waitFor(() => {
            expect(MockEventSource.instances.length).toBe(1);
        });
        const es = MockEventSource.instances[0];
        const observer = MockIntersectionObserver.instances[0];

        expect(observer.observedTargets.length).toBe(1);

        unmount();

        expect(es.closed).toBe(true);
        expect(observer.observedTargets.length).toBe(0);
    });

    it("filters out duplicate logs returned by fetchMoreAction", async () => {
        const initial = Array.from({ length: 10 }, (_, i) => ({ id: i + 1 }));
        const fetchMoreAction = vi.fn<() => Promise<LogItem[]>>().mockResolvedValue([{ id: 10 }, { id: 99 }]);

        const { getByTestId } = render(
            <TestConsumer
                {...defaultProps}
                initialHistory={initial}
                fetchMoreAction={fetchMoreAction}
            />
        );

        const observer = MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1];
        act(() => {
            observer.triggerIntersect(true);
        });

        await waitFor(() => {
            expect(getByTestId("log-count").textContent).toBe("11");
        });
    });

    it("allows another fetch after previous fetch completes successfully", async () => {
        let resolveFirst: (val: LogItem[]) => void = noop;
        const fetchMoreAction = vi.fn<() => Promise<LogItem[]>>()
            .mockImplementationOnce(() => new Promise((res) => { resolveFirst = res; }))
            .mockResolvedValueOnce(Array.from({ length: 10 }, (_, i) => ({ id: i + 50 })));

        render(
            <TestConsumer
                {...defaultProps}
                initialHistory={Array.from({ length: 10 }, (_, i) => ({ id: i }))}
                fetchMoreAction={fetchMoreAction}
            />
        );

        act(() => {
            const observer = MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1];
            observer.triggerIntersect(true);
        });
        expect(fetchMoreAction).toHaveBeenCalledTimes(1);

        act(() => {
            resolveFirst(Array.from({ length: 10 }, (_, i) => ({ id: i + 20 })));
        });

        await waitFor(() => {
            expect(fetchMoreAction).toHaveBeenCalledTimes(1);
        });

        act(() => {
            const observer = MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1];
            observer.triggerIntersect(true);
        });

        await waitFor(() => {
            expect(fetchMoreAction).toHaveBeenCalledTimes(2);
        });
    });

    it("strictly rejects non-MessageEvent and non-string event data", async () => {
        const { result } = renderHook(() => {
            return useSSEInfiniteScroll({ ...defaultProps, initialHistory: [{ id: 1 }] });
        });

        await waitFor(() => {
            expect(MockEventSource.instances.length).toBe(1);
        });
        const es = MockEventSource.instances[0];

        act(() => {
            const fakeEvent = new CustomEvent("message_delete");
            es.emit("message_delete", fakeEvent);

            const nonStringEvent = new MessageEvent("message_delete", { data: 12345 });
            es.emit("message_delete", nonStringEvent);
        });

        expect(result.current.logs).toHaveLength(1);
        expect(result.current.logs[0]?.id).toBe(1);
    });

    it("does not update logs array reference when fetchMoreAction returns 0 logs", async () => {
        const fetchMoreAction = vi.fn<() => Promise<LogItem[]>>().mockResolvedValue([]);
        const initial = Array.from({ length: 10 }, (_, i) => ({ id: i }));

        let latestLogs: readonly LogItem[] = [];
        function ReferenceChecker(): React.JSX.Element {
            const hook = useSSEInfiniteScroll({
                ...defaultProps,
                initialHistory: initial,
                fetchMoreAction,
            });
            latestLogs = hook.logs;
            return (
                <div>
                    <div ref={hook.observerTarget} />
                    <span data-testid="is-loading">{String(hook.isLoadingMore)}</span>
                </div>
            );
        }

        const { getByTestId } = render(<ReferenceChecker />);
        const initialLogsRef = latestLogs;

        const observer = MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1];
        act(() => {
            observer.triggerIntersect(true);
        });

        // Wait for the async pagination to completely finish
        await waitFor(() => {
            expect(fetchMoreAction).toHaveBeenCalledTimes(1);
            expect(getByTestId("is-loading").textContent).toBe("false");
        });

        // If setLogs was invoked, `latestLogs` would be a brand new array reference ([...prev])
        expect(latestLogs).toBe(initialLogsRef);
    });

    it("stops triggering fetches once hasMore becomes false", () => {
        const fetchMoreAction = vi.fn<() => Promise<LogItem[]>>().mockResolvedValue([{ id: 99 }]);

        render(
            <TestConsumer
                {...defaultProps}
                initialHistory={Array.from({ length: 10 }, (_, i) => ({ id: i }))}
                fetchMoreAction={fetchMoreAction}
            />
        );

        let observer = MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1];
        act(() => {
            observer.triggerIntersect(true);
        });
        expect(fetchMoreAction).toHaveBeenCalledTimes(1);

        observer = MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1];
        act(() => {
            observer.triggerIntersect(true);
        });
        expect(fetchMoreAction).toHaveBeenCalledTimes(1);
    });

    it("handles errors in fetchMoreAction, logs to console.error, and resets isLoadingMore to false", async () => {
        const fetchError = new Error("Network failure during pagination");
        const fetchMoreAction = vi.fn<() => Promise<LogItem[]>>().mockRejectedValue(fetchError);

        const { getByTestId } = render(
            <TestConsumer
                {...defaultProps}
                initialHistory={Array.from({ length: 10 }, (_, i) => ({ id: i }))}
                fetchMoreAction={fetchMoreAction}
            />
        );

        const observer = MockIntersectionObserver.instances[MockIntersectionObserver.instances.length - 1];
        act(() => {
            observer.triggerIntersect(true);
        });

        await waitFor(() => {
            // Kills: catch (err: unknown) { console.error(...) }
            expect(console.error).toHaveBeenCalledWith(
                "Error loading more message_delete logs:",
                fetchError
            );
            // Kills: setIsLoadingMore(false) in finally block
            expect(getByTestId("is-loading").textContent).toBe("false");
        });
    });
});