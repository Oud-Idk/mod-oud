import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
    getRemindersByChannels,
    saveReminder,
    deleteReminder,
} from "./queries";
import type { SaveableReminderInput } from "./types";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>()
);

const mockDel = vi.hoisted(() => vi.fn<() => Promise<number>>());
const mockPublish = vi.hoisted(() => vi.fn<() => Promise<number>>());

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
    },
}));

vi.mock("@/lib/redis", () => ({
    default: {
        del: mockDel,
        publish: mockPublish,
    },
}));

describe("Reminders Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getRemindersByChannels", () => {
        it("should return an empty array for no channels", async () => {
            const result = await getRemindersByChannels([]);

            expect(result).toEqual([]);
            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should return parsed reminder rows", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "1",
                        channelId: "chan_1",
                        message: { format: "TEXT", content: "Stand up", embed: {} },
                        rType: "SINGLE",
                        nextTriggerAt: new Date("2026-01-01T00:00:00.000Z"),
                        daysOfWeek: null,
                        timeStart: null,
                        timeEnd: null,
                        intervalSeconds: null,
                        isActive: true,
                    },
                ],
            });

            const result = await getRemindersByChannels(["chan_1"]);

            expect(result[0].id).toBe("1");
            expect(result[0].rType).toBe("SINGLE");
            const params = mockQuery.mock.calls[0][1];
            expect(params).toEqual([["chan_1"]]);
        });
    });

    describe("saveReminder", () => {
        function validInput(): SaveableReminderInput {
            return {
                channelId: "chan_1",
                rType: "SINGLE",
                message: { format: "TEXT", content: "Stand up", embed: {} },
                nextTriggerAt: new Date("2026-01-01T00:00:00.000Z"),
            };
        }

        // Kills INSERT params = [] mutant
        it("should insert a new reminder with exact params and invalidate the channel cache", async () => {
            const input = validInput();
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "5",
                        channelId: "chan_1",
                        message: input.message,
                        rType: "SINGLE",
                        nextTriggerAt: input.nextTriggerAt,
                        daysOfWeek: null,
                        timeStart: null,
                        timeEnd: null,
                        intervalSeconds: null,
                        isActive: true,
                    },
                ],
            });

            const result = await saveReminder(input);

            expect(mockQuery.mock.calls[0][0]).toContain("INSERT INTO reminders");

            // Verify params array passed to db.query
            const params = mockQuery.mock.calls[0][1];
            expect(params).toEqual([
                "chan_1",
                input.message,
                "SINGLE",
                input.nextTriggerAt,
                null,
                null,
                null,
                null,
                true,
            ]);

            expect(mockDel).toHaveBeenCalledWith("reminders:channel:chan_1");
            expect(mockPublish).toHaveBeenCalledWith("reminder_updates", "invalidate:chan_1");
            expect(result.id).toBe("5");
        });

        // Kills UPDATE params = [] and reminder.id ?? null mutants
        it("should update an existing reminder with exact params when an id is present", async () => {
            const input = { ...validInput(), id: "5" };
            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "5",
                        channelId: "chan_1",
                        message: input.message,
                        rType: "SINGLE",
                        nextTriggerAt: input.nextTriggerAt,
                        daysOfWeek: null,
                        timeStart: null,
                        timeEnd: null,
                        intervalSeconds: null,
                        isActive: true,
                    },
                ],
            });

            await saveReminder(input);

            expect(mockQuery.mock.calls[0][0]).toContain("UPDATE reminders");

            // Verify params array passed to db.query
            const params = mockQuery.mock.calls[0][1];
            expect(params).toEqual([
                "5",
                "chan_1",
                input.message,
                "SINGLE",
                input.nextTriggerAt,
                null,
                null,
                null,
                null,
                true,
            ]);
        });

        // Kills ALL RECURRING rType mutants and calculateNextTriggerJS execution
        it("should calculate next trigger for a RECURRING reminder and pass correct params", async () => {
            const recurringInput: SaveableReminderInput = {
                channelId: "chan_1",
                rType: "RECURRING",
                message: { format: "TEXT", content: "Recurring standup", embed: {} },
                daysOfWeek: [1, 3],
                timeStart: "09:00",
                timeEnd: "17:00",
                intervalSeconds: 3600,
            };

            mockQuery.mockResolvedValue({
                rows: [
                    {
                        id: "10",
                        channelId: "chan_1",
                        message: recurringInput.message,
                        rType: "RECURRING",
                        nextTriggerAt: new Date("2026-01-01T09:00:00.000Z"),
                        daysOfWeek: [1, 3],
                        timeStart: "09:00",
                        timeEnd: "17:00",
                        intervalSeconds: 3600,
                        isActive: true,
                    },
                ],
            });

            const result = await saveReminder(recurringInput);

            expect(result.id).toBe("10");
            expect(result.rType).toBe("RECURRING");

            const params = mockQuery.mock.calls[0][1];
            expect(params?.[2]).toBe("RECURRING");
            // Verify finalNextTrigger was calculated dynamically (should be a Date)
            expect(params?.[3]).toBeInstanceOf(Date);
            expect(params?.[4]).toEqual([1, 3]);
            expect(params?.[5]).toBe("09:00");
            expect(params?.[6]).toBe("17:00");
            expect(params?.[7]).toBe(3600);
        });

        it("should skip cache invalidation for a null channel", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await expect(
                saveReminder({ ...validInput(), channelId: null })
            ).rejects.toThrow();

            expect(mockDel).not.toHaveBeenCalled();
        });

        it("should throw a validation error for invalid input", async () => {
            await expect(
                saveReminder({
                    channelId: "chan_1",
                    rType: "SINGLE",
                    message: { format: "TEXT", content: "", embed: {} },
                })
            ).rejects.toThrow();
            expect(mockQuery).not.toHaveBeenCalled();
        });
    });

    describe("deleteReminder", () => {
        it("should delete the reminder and invalidate the channel cache", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await deleteReminder("5", "chan_1");

            const params = mockQuery.mock.calls[0][1];
            expect(params).toEqual(["5"]);
            expect(mockDel).toHaveBeenCalledWith("reminders:channel:chan_1");
            expect(mockPublish).toHaveBeenCalledWith("reminder_updates", "invalidate:chan_1");
        });

        it("should skip cache invalidation for a null channel", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await deleteReminder("5", null);

            expect(mockDel).not.toHaveBeenCalled();
            expect(mockPublish).not.toHaveBeenCalled();
        });
    });
});