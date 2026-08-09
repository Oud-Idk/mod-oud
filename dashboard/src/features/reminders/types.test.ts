import { describe, it, expect } from "vitest";
import {
    reminderFormatSchema,
    reminderTypeSchema,
    reminderBaseSchema,
    saveableReminderSchema,
    reminderRowSchema,
} from "./types";

describe("reminderFormatSchema", () => {
    it("should default to TEXT", () => {
        expect(reminderFormatSchema.parse(undefined)).toBe("TEXT");
    });

    it("should accept EMBED", () => {
        expect(reminderFormatSchema.safeParse("EMBED").success).toBe(true);
    });

    it("should REJECT an unknown format", () => {
        expect(reminderFormatSchema.safeParse("MIXED").success).toBe(false);
    });
});

describe("reminderTypeSchema", () => {
    it("should default to SINGLE", () => {
        expect(reminderTypeSchema.parse(undefined)).toBe("SINGLE");
    });

    it("should accept RECURRING", () => {
        expect(reminderTypeSchema.safeParse("RECURRING").success).toBe(true);
    });
});

describe("reminderBaseSchema", () => {
    it("should apply defaults", () => {
        const parsed = reminderBaseSchema.parse({});

        expect(parsed.channelId).toBeNull();
        expect(parsed.rType).toBe("SINGLE");
        expect(parsed.nextTriggerAt).toBeInstanceOf(Date);
        expect(parsed.daysOfWeek).toBeNull();
        expect(parsed.timeStart).toBeNull();
        expect(parsed.timeEnd).toBeNull();
        expect(parsed.intervalSeconds).toBeNull();
        expect(parsed.isActive).toBe(true);
    });

    it("should keep provided values", () => {
        const date = new Date("2026-01-01T00:00:00.000Z");
        const parsed = reminderBaseSchema.parse({
            channelId: "chan_1",
            rType: "RECURRING",
            nextTriggerAt: date,
            daysOfWeek: [1, 3],
            timeStart: "09:00",
            timeEnd: "17:00",
            intervalSeconds: 3600,
            isActive: false,
        });

        expect(parsed.channelId).toBe("chan_1");
        expect(parsed.daysOfWeek).toEqual([1, 3]);
        expect(parsed.intervalSeconds).toBe(3600);
        expect(parsed.isActive).toBe(false);
    });
});

describe("saveableReminderSchema", () => {
    function validBase(): { channelId: string; rType: "SINGLE"; message: { format: "TEXT"; content: string; embed: object } } {
        return {
            channelId: "chan_1",
            rType: "SINGLE",
            message: { format: "TEXT", content: "Reminder text", embed: {} },
        };
    }

    it("should accept a valid single reminder", () => {
        expect(saveableReminderSchema.safeParse(validBase()).success).toBe(true);
    });

    it("should REJECT a missing channel", () => {
        const result = saveableReminderSchema.safeParse({
            ...validBase(),
            channelId: undefined,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path[0] === "channelId")).toBe(true);
        }
    });

    it("should REJECT an empty TEXT message", () => {
        const result = saveableReminderSchema.safeParse({
            ...validBase(),
            message: { format: "TEXT", content: "", embed: {} },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path[0] === "message")).toBe(true);
        }
    });

    it("should accept a RECURRING reminder with a start time", () => {
        const result = saveableReminderSchema.safeParse({
            ...validBase(),
            rType: "RECURRING",
            timeStart: "09:00",
        });

        expect(result.success).toBe(true);
    });

    it("should accept a RECURRING reminder with an interval", () => {
        const result = saveableReminderSchema.safeParse({
            ...validBase(),
            rType: "RECURRING",
            intervalSeconds: 3600,
        });

        expect(result.success).toBe(true);
    });

    it("should accept a RECURRING reminder with active days", () => {
        const result = saveableReminderSchema.safeParse({
            ...validBase(),
            rType: "RECURRING",
            daysOfWeek: [1],
        });

        expect(result.success).toBe(true);
    });

    it("should REJECT a RECURRING reminder with no schedule", () => {
        const result = saveableReminderSchema.safeParse({
            ...validBase(),
            rType: "RECURRING",
            daysOfWeek: [],
            timeStart: undefined,
            intervalSeconds: undefined,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path[0] === "rType")).toBe(true);
        }
    });
});

describe("reminderRowSchema", () => {
    it("should require an id", () => {
        const result = reminderRowSchema.safeParse({
            ...reminderBaseSchema.parse({}),
            id: "reminder_1",
            message: { format: "TEXT", content: "Reminder text", embed: {} },
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.id).toBe("reminder_1");
        }
    });

    it("should REJECT a row without an id", () => {
        expect(reminderRowSchema.safeParse(reminderBaseSchema.parse({})).success).toBe(false);
    });
});
