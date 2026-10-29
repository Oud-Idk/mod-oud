import { describe, it, expect } from "vitest";
import { formatDuration, formatRelativeTime } from "./time";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe("formatDuration", () => {
    it.each([
        [0, "1m"],
        [30_000, "1m"],
        [MINUTE, "1m"],
        [59 * MINUTE, "59m"],
        [HOUR, "1h"],
        [23 * HOUR + 59 * MINUTE, "23h"],
        [DAY, "1d"],
        [10 * DAY, "10d"],
        [-5 * MINUTE, "1m"],
    ])("formats %d ms as %s", (ms, expected) => {
        expect(formatDuration(ms)).toBe(expected);
    });
});

describe("formatRelativeTime", () => {
    const now = Date.UTC(2026, 9, 29, 12, 0, 0);

    it.each([
        [0, "just now"],
        [59_000, "just now"],
        [MINUTE, "1m ago"],
        [5 * HOUR, "5h ago"],
        [3 * DAY, "3d ago"],
    ])("formats a date %d ms in the past as %s", (offset, expected) => {
        expect(formatRelativeTime(new Date(now - offset), now)).toBe(expected);
    });

    it("treats a future date as just now", () => {
        expect(formatRelativeTime(new Date(now + HOUR), now)).toBe("just now");
    });
});
