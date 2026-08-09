import { describe, it, expect } from "vitest";
import { z } from "zod";
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

    // Kills reminderFormatSchema "TEXT" enum mutant
    it("should accept TEXT explicitly", () => {
        expect(reminderFormatSchema.safeParse("TEXT").success).toBe(true);
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
    function validBase() {
        return {
            channelId: "chan_1",
            rType: "SINGLE" as const,
            message: { format: "TEXT" as const, content: "Reminder text", embed: {} },
        };
    }

    it("should accept a valid single reminder", () => {
        expect(saveableReminderSchema.safeParse(validBase()).success).toBe(true);
    });

    // Kills channelId .trim() whitespace & exact issue mutants
    it("should REJECT a missing or whitespace channel with exact issue", () => {
        const resultMissing = saveableReminderSchema.safeParse({
            ...validBase(),
            channelId: undefined,
        });

        expect(resultMissing.success).toBe(false);
        if (!resultMissing.success) {
            expect(resultMissing.error.issues).toContainEqual({
                code: z.ZodIssueCode.custom,
                message: "Please select a target channel.",
                path: ["channelId"],
            });
        }

        const resultSpace = saveableReminderSchema.safeParse({
            ...validBase(),
            channelId: "   ",
        });
        expect(resultSpace.success).toBe(false);
    });

    // Kills TEXT format message content, .trim(), path ["message", "content"], and message mutants
    it("should REJECT an empty or whitespace TEXT message with exact issue", () => {
        const resultEmpty = saveableReminderSchema.safeParse({
            ...validBase(),
            message: { format: "TEXT", content: "", embed: {} },
        });

        expect(resultEmpty.success).toBe(false);
        if (!resultEmpty.success) {
            expect(resultEmpty.error.issues).toContainEqual({
                code: z.ZodIssueCode.custom,
                message: "Message content cannot be empty for plain text format.",
                path: ["message", "content"],
            });
        }

        const resultSpace = saveableReminderSchema.safeParse({
            ...validBase(),
            message: { format: "TEXT", content: "   ", embed: {} },
        });
        expect(resultSpace.success).toBe(false);
    });

    // Kills format === "TEXT" condition mutants (e.g. format === "EMBED" shouldn't trigger text content check)
    it("should PASS an EMBED message format even if text content is empty", () => {
        const result = saveableReminderSchema.safeParse({
            ...validBase(),
            message: { format: "EMBED", content: "", embed: { title: "Reminder Title" } },
        });

        expect(result.success).toBe(true);
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

    // Kills rType error message mutant
    it("should REJECT a RECURRING reminder with no schedule and set exact issue", () => {
        const result = saveableReminderSchema.safeParse({
            ...validBase(),
            rType: "RECURRING",
            daysOfWeek: [],
            timeStart: undefined,
            intervalSeconds: undefined,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual({
                code: z.ZodIssueCode.custom,
                message: "Recurring reminders require a start time, interval, or active days.",
                path: ["rType"],
            });
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

    // Kills reminderRowSchema extend mutant
    it("should REJECT a row missing an id and target path ['id']", () => {
        const result = reminderRowSchema.safeParse({
            channelId: "chan_1",
            message: { format: "TEXT", content: "Reminder text", embed: {} },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].path).toEqual(["id"]);
        }
    });
});