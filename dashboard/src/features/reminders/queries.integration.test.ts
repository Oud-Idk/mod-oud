import { beforeEach, describe, expect, it, vi } from "vitest";
import redis from "@/lib/redis";
import {
    deleteReminder,
    getRemindersByChannels,
    saveReminder,
} from "./queries";
import { saveableReminderSchema, type SaveableReminderInput } from "./types";

const CHANNEL_A = "111111111111111111";
const CHANNEL_B = "222222222222222222";

function singleInput(overrides: Record<string, unknown> = {}): SaveableReminderInput {
    return saveableReminderSchema.parse({
        channelId: CHANNEL_A,
        rType: "SINGLE",
        message: { format: "TEXT", content: "Stand up", embed: {} },
        nextTriggerAt: new Date("2026-06-01T12:00:00.000Z"),
        ...overrides,
    });
}

beforeEach(() => {
    vi.mocked(redis.del).mockClear();
    vi.mocked(redis.publish).mockClear();
});

describe("reminders against a real database", () => {
    it("returns an empty array when no channel ids are given", async () => {
        expect(await getRemindersByChannels([])).toEqual([]);
    });

    it("returns an empty array for an unknown channel", async () => {
        expect(await getRemindersByChannels([CHANNEL_A])).toEqual([]);
    });

    it("round-trips an inserted reminder", async () => {
        const saved = await saveReminder(singleInput());

        expect(typeof saved.id).toBe("string");
        expect(saved.channelId).toBe(CHANNEL_A);
        expect(saved.rType).toBe("SINGLE");
        expect(saved.message).toEqual({ format: "TEXT", content: "Stand up", embed: {} });
        expect(saved.nextTriggerAt).toEqual(new Date("2026-06-01T12:00:00.000Z"));
        expect(saved.daysOfWeek).toBeNull();
        expect(saved.timeStart).toBeNull();
        expect(saved.timeEnd).toBeNull();
        expect(saved.intervalSeconds).toBeNull();
        expect(saved.isActive).toBe(true);

        const [loaded] = await getRemindersByChannels([CHANNEL_A]);
        expect(loaded.id).toBe(saved.id);
        expect(loaded.message).toEqual(saved.message);
    });

    it("orders reminders by next_trigger_at ascending", async () => {
        await saveReminder(singleInput({ nextTriggerAt: new Date("2026-06-03T00:00:00.000Z") }));
        await saveReminder(singleInput({ nextTriggerAt: new Date("2026-06-01T00:00:00.000Z") }));

        const rows = await getRemindersByChannels([CHANNEL_A]);

        expect(rows.map((r) => r.nextTriggerAt.toISOString())).toEqual([
            "2026-06-01T00:00:00.000Z",
            "2026-06-03T00:00:00.000Z",
        ]);
    });

    it("fetches reminders across channels with ::BIGINT[] ANY", async () => {
        await saveReminder(singleInput({ channelId: CHANNEL_A }));
        await saveReminder(singleInput({ channelId: CHANNEL_B }));

        const rows = await getRemindersByChannels([CHANNEL_A, CHANNEL_B]);

        expect(rows).toHaveLength(2);
        expect(new Set(rows.map((r) => r.channelId))).toEqual(new Set([CHANNEL_A, CHANNEL_B]));
    });

    it("round-trips INT[] days of week", async () => {
        const saved = await saveReminder(
            singleInput({
                rType: "RECURRING",
                daysOfWeek: [1, 3, 5],
                timeStart: "09:00",
                timeEnd: "17:00",
                intervalSeconds: 3600,
            })
        );

        expect(saved.rType).toBe("RECURRING");
        expect(saved.daysOfWeek).toEqual([1, 3, 5]);
        expect(saved.intervalSeconds).toBe(3600);
        expect(saved.timeStart).toBe("09:00:00");
        expect(saved.timeEnd).toBe("17:00:00");
    });

    it("round-trips channels and updates all fields on edit", async () => {
        const saved = await saveReminder(singleInput());

        const updated = await saveReminder({
            ...singleInput(),
            id: saved.id,
            channelId: CHANNEL_B,
            message: { format: "TEXT", content: "Updated", embed: {} },
            nextTriggerAt: new Date("2026-07-01T00:00:00.000Z"),
            isActive: false,
        });

        expect(updated.id).toBe(saved.id);
        expect(updated.channelId).toBe(CHANNEL_B);
        expect(updated.message).toEqual({ format: "TEXT", content: "Updated", embed: {} });
        expect(updated.nextTriggerAt).toEqual(new Date("2026-07-01T00:00:00.000Z"));
        expect(updated.isActive).toBe(false);

        expect(await getRemindersByChannels([CHANNEL_A])).toHaveLength(0);
        expect(await getRemindersByChannels([CHANNEL_B])).toHaveLength(1);
    });

    it("uses a calculated next trigger for recurring reminders", async () => {
        const saved = await saveReminder(
            singleInput({
                rType: "RECURRING",
                daysOfWeek: [1],
                timeStart: "09:00",
                intervalSeconds: 1800,
            })
        );

        expect(saved.nextTriggerAt).toBeInstanceOf(Date);
        expect(saved.nextTriggerAt.getTime()).toBeGreaterThan(Date.now() - 60_000);
    });

    it("deletes a reminder by id", async () => {
        const saved = await saveReminder(singleInput());

        await deleteReminder(saved.id, CHANNEL_A);

        expect(await getRemindersByChannels([CHANNEL_A])).toEqual([]);
    });

    it("invalidates the channel cache on save", async () => {
        await saveReminder(singleInput());

        expect(vi.mocked(redis.del)).toHaveBeenCalledWith(`reminders:channel:${CHANNEL_A}`);
        expect(vi.mocked(redis.publish)).toHaveBeenCalledWith(
            "reminder_updates",
            `invalidate:${CHANNEL_A}`
        );
    });

    it("invalidates the channel cache on delete", async () => {
        const saved = await saveReminder(singleInput());
        vi.mocked(redis.del).mockClear();
        vi.mocked(redis.publish).mockClear();

        await deleteReminder(saved.id, CHANNEL_A);

        expect(vi.mocked(redis.del)).toHaveBeenCalledWith(`reminders:channel:${CHANNEL_A}`);
        expect(vi.mocked(redis.publish)).toHaveBeenCalledWith(
            "reminder_updates",
            `invalidate:${CHANNEL_A}`
        );
    });

    it("stores an EMBED message layout as JSONB", async () => {
        const message = {
            format: "EMBED" as const,
            content: "",
            embed: { title: "Hi", color: 12345 },
        };
        const saved = await saveReminder(singleInput({ message }));

        const [loaded] = await getRemindersByChannels([CHANNEL_A]);
        expect(loaded.message).toEqual(message);
        expect(saved.message).toEqual(message);
    });

    it("stores time fields as TEXT-readable nulls", async () => {
        const saved = await saveReminder(singleInput({ timeStart: null, timeEnd: null }));

        expect(saved.timeStart).toBeNull();
        expect(saved.timeEnd).toBeNull();
    });
});
