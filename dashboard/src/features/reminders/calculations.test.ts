import { describe, it, expect, vi } from "vitest";

import { calculateNextTriggerJS } from "@/features/reminders/calculations";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>()
);

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
    },
}));

vi.mock("@/lib/redis", () => ({
    default: {
        del: vi.fn<() => Promise<number>>(),
        publish: vi.fn<() => Promise<number>>(),
    },
}));

interface TriggerRule {
    daysOfWeek: number[] | null;
    timeStart: string | null;
    timeEnd: string | null;
    intervalSeconds: number | null;
};

function rule(overrides: Partial<TriggerRule> = {}): TriggerRule {
    return {
        daysOfWeek: null,
        timeStart: null,
        timeEnd: null,
        intervalSeconds: null,
        ...overrides,
    };
}

describe("calculateNextTriggerJS", () => {
    it("should return the start time on the same day when now is before it", () => {
        const now = new Date("2026-01-07T08:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({ timeStart: "10:00" }));

        expect(result.toISOString()).toBe("2026-01-07T10:00:00.000Z");
    });

    it("should return the start time on the next day when now is past it", () => {
        const now = new Date("2026-01-07T14:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({ timeStart: "10:00" }));

        expect(result.toISOString()).toBe("2026-01-08T10:00:00.000Z");
    });

    it("should skip inactive weekdays and land on the next active day", () => {
        const now = new Date("2026-01-07T08:00:00.000Z"); // Wednesday

        const result = calculateNextTriggerJS(now, rule({ daysOfWeek: [1], timeStart: "10:00" }));

        expect(result.toISOString()).toBe("2026-01-12T10:00:00.000Z"); // next Monday
    });

    it("should return the next interval within today's window", () => {
        const now = new Date("2026-01-07T09:30:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "09:00",
            timeEnd: "17:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-07T10:30:00.000Z");
    });

    it("should advance to the next day when the interval crosses the window end", () => {
        const now = new Date("2026-01-07T16:30:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "09:00",
            timeEnd: "17:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-08T09:00:00.000Z");
    });

    it("should handle a window that crosses midnight without an interval", () => {
        const now = new Date("2026-01-07T23:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "22:00",
            timeEnd: "06:00",
        }));

        expect(result.toISOString()).toBe("2026-01-08T22:00:00.000Z");
    });

    it("should return the next interval inside an overnight window", () => {
        const now = new Date("2026-01-07T23:30:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "22:00",
            timeEnd: "06:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-08T00:30:00.000Z");
    });

    it("should return the interval from the active day when now is inside it", () => {
        const now = new Date("2026-01-07T10:00:00.000Z"); // Wednesday

        const result = calculateNextTriggerJS(now, rule({
            daysOfWeek: [3],
            timeStart: "09:00",
            timeEnd: "17:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-07T11:00:00.000Z");
    });

    it("should not return a candidate at the exact start time on the current day", () => {
        const now = new Date("2026-01-07T10:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({ timeStart: "10:00" }));

        expect(result.toISOString()).toBe("2026-01-08T10:00:00.000Z");
    });

    it("should parse a start time with seconds", () => {
        const now = new Date("2026-01-07T10:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({ timeStart: "10:00:30" }));

        expect(result.toISOString()).toBe("2026-01-07T10:00:30.000Z");
    });

    it("should parse a start time with only hours and minutes", () => {
        const now = new Date("2026-01-07T08:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({ timeStart: "10:30" }));

        expect(result.toISOString()).toBe("2026-01-07T10:30:00.000Z");
    });

    it("should fall back to zero minutes and seconds for an hour-only time", () => {
        const now = new Date("2026-01-07T08:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({ timeStart: "10" }));

        expect(result.toISOString()).toBe("2026-01-07T10:00:00.000Z");
    });

    it("should return the next interval inside yesterday's overnight window", () => {
        const now = new Date("2026-01-08T02:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "22:00",
            timeEnd: "06:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-08T03:00:00.000Z");
    });

    it("should honor a custom end time for the window", () => {
        const now = new Date("2026-01-07T10:15:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "10:00",
            timeEnd: "12:00",
            intervalSeconds: 1800,
        }));

        expect(result.toISOString()).toBe("2026-01-07T10:45:00.000Z");
    });

    it("should treat an empty (start == end) window as no window and fall back to the next start", () => {
        const now = new Date("2026-01-07T11:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "10:00",
            timeEnd: "10:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-08T10:00:00.000Z");
    });

    it("should fire the interval when now is exactly at the start of the window", () => {
        const now = new Date("2026-01-07T10:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "10:00",
            timeEnd: "17:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-07T11:00:00.000Z");
    });

    it("should fire the interval when now is exactly at the start of an overnight window", () => {
        const now = new Date("2026-01-07T22:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "22:00",
            timeEnd: "06:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-07T23:00:00.000Z");
    });

    it("should continue yesterday's overnight interval into today when yesterday was active", () => {
        const now = new Date("2026-01-08T02:00:00.000Z"); // Thursday, yesterday = Wednesday

        const result = calculateNextTriggerJS(now, rule({
            daysOfWeek: [3],
            timeStart: "22:00",
            timeEnd: "06:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-08T03:00:00.000Z");
    });

    it("should not extend yesterday's overnight window into a day whose predecessor was inactive", () => {
        const now = new Date("2026-01-08T02:00:00.000Z"); // Thursday, yesterday = Wednesday

        const result = calculateNextTriggerJS(now, rule({
            daysOfWeek: [4],
            timeStart: "22:00",
            timeEnd: "06:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-08T22:00:00.000Z");
    });

    it("should ignore an inactive weekday even when it is inside the time window", () => {
        const now = new Date("2026-01-07T10:00:00.000Z"); // Wednesday

        const result = calculateNextTriggerJS(now, rule({
            daysOfWeek: [1],
            timeStart: "09:00",
            timeEnd: "17:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-12T09:00:00.000Z");
    });

    it("should return the start instead of firing an interval when now is before the start", () => {
        const now = new Date("2026-01-07T08:30:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "09:00",
            timeEnd: "17:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-07T09:00:00.000Z");
    });

    it("should not apply yesterday's overnight logic to a zero-length window", () => {
        const now = new Date("2026-01-07T02:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "10:00",
            timeEnd: "10:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-07T10:00:00.000Z");
    });

    it("should return the interval even late in the window", () => {
        const now = new Date("2026-01-07T15:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "09:00",
            timeEnd: "17:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-07T16:00:00.000Z");
    });

    it("should not accept an interval that lands on the next day inside a same-day window", () => {
        const now = new Date("2026-01-07T10:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "09:00",
            timeEnd: "17:00",
            intervalSeconds: 86400,
        }));

        expect(result.toISOString()).toBe("2026-01-08T09:00:00.000Z");
    });

    it("should not accept an interval that lands several days away inside an overnight window", () => {
        const now = new Date("2026-01-07T23:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "22:00",
            timeEnd: "06:00",
            intervalSeconds: 172800,
        }));

        expect(result.toISOString()).toBe("2026-01-08T22:00:00.000Z");
    });

    it("should not return an interval that overshoots the end of yesterday's overnight window", () => {
        const now = new Date("2026-01-08T05:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "22:00",
            timeEnd: "06:00",
            intervalSeconds: 10800,
        }));

        expect(result.toISOString()).toBe("2026-01-08T22:00:00.000Z");
    });

    it("should not return an interval from yesterday's overnight window that lands on a later day", () => {
        const now = new Date("2026-01-08T05:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "22:00",
            timeEnd: "06:00",
            intervalSeconds: 86400,
        }));

        expect(result.toISOString()).toBe("2026-01-08T22:00:00.000Z");
    });

    it("should not return an interval that lands exactly at the end of yesterday's overnight window", () => {
        const now = new Date("2026-01-08T05:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "22:00",
            timeEnd: "06:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-08T22:00:00.000Z");
    });

    it("should return midnight start when now is past it on the same day", () => {
        const now = new Date("2026-01-07T10:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({ timeStart: "00:00" }));

        expect(result.toISOString()).toBe("2026-01-08T00:00:00.000Z");
    });

    it("should honor minutes when comparing against the window start", () => {
        const now = new Date("2026-01-07T10:29:59.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "10:30",
            timeEnd: "17:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-07T10:30:00.000Z");
    });

    it("should treat a null start time as midnight when firing intervals", () => {
        const now = new Date("2026-01-07T10:00:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: null,
            timeEnd: "17:00",
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-07T11:00:00.000Z");
    });

    it("should treat a null end time as the end of the day when firing intervals", () => {
        const now = new Date("2026-01-07T23:30:00.000Z");

        const result = calculateNextTriggerJS(now, rule({
            timeStart: "22:00",
            timeEnd: null,
            intervalSeconds: 3600,
        }));

        expect(result.toISOString()).toBe("2026-01-08T22:00:00.000Z");
    });
});
