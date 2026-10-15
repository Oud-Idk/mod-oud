import { describe, expect, it, vi } from "vitest";
import {
    ackSchema,
    eventSchema,
    nowPlayingPayloadSchema,
    parseDuration,
    parseRequester,
} from "./musicSocketProtocol";

vi.mock("@/features/realtime/actions", () => ({
    issueRealtimeTicketAction: vi.fn(),
}));

describe("ackSchema", () => {
    it("parses a minimal ack", () => {
        expect(ackSchema.parse({ type: "ack", ok: true })).toEqual({ ok: true, type: "ack" });
    });

    it("parses a full ack with data", () => {
        const parsed = ackSchema.parse({
            type: "ack",
            requestId: "r1",
            ok: false,
            error: "Nope",
            data: { track: 2 },
        });

        expect(parsed.requestId).toBe("r1");
        expect(parsed.data).toEqual({ track: 2 });
    });

    it("rejects a non-ack type", () => {
        expect(ackSchema.safeParse({ type: "event", ok: true }).success).toBe(false);
    });

    it("rejects requester objects without a name", () => {
        expect(
            nowPlayingPayloadSchema.safeParse({ requested_by: { foo: 1 } }).success
        ).toBe(false);
    });

    it("rejects a missing or non-boolean ok", () => {
        expect(ackSchema.safeParse({ type: "ack" }).success).toBe(false);
        expect(ackSchema.safeParse({ type: "ack", ok: "yes" }).success).toBe(false);
    });
});

describe("eventSchema", () => {
    it("parses a nowPlaying event", () => {
        expect(
            eventSchema.parse({ type: "event", event: "nowPlaying", data: { title: "Song" } })
        ).toEqual({ type: "event", event: "nowPlaying", data: { title: "Song" } });
    });

    it("rejects a missing event name", () => {
        expect(eventSchema.safeParse({ type: "event" }).success).toBe(false);
    });
});

describe("nowPlayingPayloadSchema", () => {
    it("parses an empty object", () => {
        expect(nowPlayingPayloadSchema.parse({}).title).toBeUndefined();
    });

    it("parses snake_case fields", () => {
        const parsed = nowPlayingPayloadSchema.parse({
            title: "Song",
            position_sec: 10,
            is_paused: true,
            is_live: false,
        });

        expect(parsed.position_sec).toBe(10);
        expect(parsed.is_paused).toBe(true);
        expect(parsed.is_live).toBe(false);
    });

    it("parses camelCase fields alongside", () => {
        const parsed = nowPlayingPayloadSchema.parse({
            positionSec: 20,
            isPaused: false,
            requestedBy: "Solo",
        });

        expect(parsed.positionSec).toBe(20);
        expect(parsed.requestedBy).toBe("Solo");
    });

    it("parses nested metadata", () => {
        const parsed = nowPlayingPayloadSchema.parse({
            metadata: { title: "Meta", duration: 90 },
        });

        expect(parsed.metadata?.title).toBe("Meta");
        expect(parsed.metadata?.duration).toBe(90);
    });

    it("rejects mistyped fields", () => {
        expect(nowPlayingPayloadSchema.safeParse({ title: 42 }).success).toBe(false);
        expect(nowPlayingPayloadSchema.safeParse({ position_sec: "abc" }).success).toBe(false);
    });
});

describe("parseRequester", () => {
    it("returns strings untouched", () => {
        expect(parseRequester("Alice")).toBe("Alice");
    });

    it("reads the name off requester objects", () => {
        expect(parseRequester({ name: "Bob" })).toBe("Bob");
    });

    it.each([undefined, null, 42, {}, { name: 5 }])("returns undefined for %j", (raw) => {
        expect(parseRequester(raw)).toBeUndefined();
    });
});

describe("parseDuration", () => {
    it("returns numbers untouched", () => {
        expect(parseDuration(180)).toBe(180);
        expect(parseDuration(0)).toBe(0);
    });

    it("returns zero for null and unparseable input", () => {
        expect(parseDuration(null)).toBe(0);
        expect(parseDuration(undefined)).toBe(0);
        expect(parseDuration("abc")).toBe(0);
        expect(parseDuration("")).toBe(0);
        expect(parseDuration(true)).toBe(0);
        expect(parseDuration({})).toBe(0);
    });

    it("parses numeric strings", () => {
        expect(parseDuration("12.5")).toBe(12.5);
    });

    it("prefers secs over seconds over duration", () => {
        expect(parseDuration({ secs: 5 })).toBe(5);
        expect(parseDuration({ seconds: 6 })).toBe(6);
        expect(parseDuration({ duration: 7 })).toBe(7);
        expect(parseDuration({ secs: 1, seconds: 2, duration: 3 })).toBe(1);
        expect(parseDuration({ seconds: 2, duration: 3 })).toBe(2);
    });
});
