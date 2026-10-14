import { describe, expect, it, vi } from "vitest";
import { parseDuration, parseRequester } from "./musicSocketProtocol";

vi.mock("@/features/realtime/actions", () => ({
    issueRealtimeTicketAction: vi.fn(),
}));

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
