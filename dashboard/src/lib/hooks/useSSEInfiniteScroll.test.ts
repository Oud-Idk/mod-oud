import { describe, it, expect, vi } from "vitest";
import {
    buildNewSSELogEntry,
    normalizeSSEUsernames,
    sseLogPayloadSchema,
} from "./useSSEInfiniteScroll";

vi.mock("@/features/realtime/actions", () => ({
    issueRealtimeTicketAction: vi.fn(),
}));

function parseDeleteEvent(overrides: Record<string, unknown> = {}): ReturnType<
    typeof sseLogPayloadSchema.parse
> {
    return sseLogPayloadSchema.parse({
        id: 5,
        guild_id: "guild_123",
        channel_id: "chan_1",
        message_id: "msg_1",
        author_id: "user_1",
        content: "hello",
        deleted_by_id: "user_9",
        ...overrides,
    });
}

function parseEditEvent(overrides: Record<string, unknown> = {}): ReturnType<
    typeof sseLogPayloadSchema.parse
> {
    return sseLogPayloadSchema.parse({
        id: 7,
        guild_id: "guild_123",
        channel_id: "chan_1",
        message_id: "msg_2",
        author_id: "user_1",
        message_content: "after",
        ...overrides,
    });
}

describe("normalizeSSEUsernames", () => {
    it("should return no fields when the event omits them, so merges preserve existing usernames", () => {
        expect(normalizeSSEUsernames(parseDeleteEvent())).toEqual({});
    });

    it("should map realtime *_name fields to canonical *_username fields", () => {
        const normalized = normalizeSSEUsernames(
            parseDeleteEvent({ author_name: "Alice", deleted_by_name: "Mod" })
        );

        expect(normalized).toEqual({
            author_username: "Alice",
            deleted_by_username: "Mod",
        });
    });
});

describe("history merge", () => {
    function mergeExisting(
        existing: Record<string, unknown>,
        rawEvent: Record<string, unknown>
    ): Record<string, unknown> {
        const parsed = sseLogPayloadSchema.parse(rawEvent);
        // Mirrors the merge expression in handleEvent.
        return { ...existing, ...parsed, ...normalizeSSEUsernames(parsed) };
    }

    it("should preserve existing usernames when a partial event omits username fields", () => {
        const existing = {
            id: 5,
            author_id: "user_1",
            author_username: "Alice",
            deleted_by_id: "user_9",
            deleted_by_username: "Mod",
        };

        const merged = mergeExisting(existing, {
            id: 5,
            guild_id: "guild_123",
            deleted_by_id: "user_9",
            deleted_by_name: null,
        });

        expect(merged.author_username).toBe("Alice");
        expect(merged.deleted_by_username).toBe("Mod");
    });

    it("should overwrite only the username fields present in the event", () => {
        const existing = {
            id: 5,
            author_id: "user_1",
            author_username: "Old",
            deleted_by_id: "user_9",
            deleted_by_username: "Mod",
        };

        const merged = mergeExisting(existing, {
            id: 5,
            guild_id: "guild_123",
            author_name: "Alice",
        });

        expect(merged.author_username).toBe("Alice");
        expect(merged.deleted_by_username).toBe("Mod");
    });
});

describe("buildNewSSELogEntry", () => {
    it("should initialize safe username defaults for a message-delete event without username fields", () => {
        const entry = buildNewSSELogEntry(parseDeleteEvent(), 5, "guild_123");

        expect(entry.author_username).toBe("");
        expect(entry.deleted_by_username).toBe("");
        // Exact viewer access pattern from DeleteMessageLogViewer (must not throw)
        expect(entry.author_username.length).toBe(0);
        expect(entry.deleted_by_username.length).toBe(0);
    });

    it("should initialize safe username defaults for a message-edit event without username fields", () => {
        const entry = buildNewSSELogEntry(parseEditEvent(), 7, "guild_123");

        expect(entry.author_username).toBe("");
        // Exact viewer access pattern from EditMessageLogViewer (must not throw)
        expect(entry.author_username.length).toBe(0);
    });

    it("should carry realtime names into the canonical fields", () => {
        const entry = buildNewSSELogEntry(
            parseDeleteEvent({ author_name: "Alice", deleted_by_name: "Mod" }),
            5,
            "guild_123"
        );

        expect(entry.author_username).toBe("Alice");
        expect(entry.deleted_by_username).toBe("Mod");
    });

    it("should prefer realtime *_name over history-style *_username", () => {
        const entry = buildNewSSELogEntry(
            parseEditEvent({ author_name: "Live", author_username: "Stale" }),
            7,
            "guild_123"
        );

        expect(entry.author_username).toBe("Live");
    });

    it("should fall back to the history-style name when no realtime name is present", () => {
        const entry = buildNewSSELogEntry(parseEditEvent({ author_username: "Cached" }), 7, "guild_123");

        expect(entry.author_username).toBe("Cached");
    });
});
