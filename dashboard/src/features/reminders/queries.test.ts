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

// Row mapping, SQL shape, tenant scoping, cache keys and the recurring
// trigger calculation live in queries.integration.test.ts against a real
// database. What stays here is the behaviour a real database will not produce
// on demand: input validation that skips the query and the null-channel
// cache skip.

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
        it("should skip cache invalidation for a null channel", async () => {
            mockQuery.mockResolvedValue({ rows: [] });

            await deleteReminder("5", null);

            expect(mockDel).not.toHaveBeenCalled();
            expect(mockPublish).not.toHaveBeenCalled();
        });
    });
});