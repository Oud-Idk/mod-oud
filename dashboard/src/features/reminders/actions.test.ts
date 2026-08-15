import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import { saveReminderAction, deleteReminderAction } from "./actions";
import { deleteReminder, saveReminder } from "./queries";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { revalidatePath } from "next/cache";
import type { ReminderRow, SaveableReminderInput } from "./types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("./queries", () => ({
    deleteReminder: vi.fn(),
    saveReminder: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

const validInput: SaveableReminderInput = {
    channelId: "chan_1",
    rType: "SINGLE",
    message: { format: "TEXT", content: "Stand up", embed: {} },
    nextTriggerAt: new Date("2026-01-01T00:00:00.000Z"),
};

function reminderRowFixture(): ReminderRow {
    return {
        id: "5",
        channelId: "chan_1",
        rType: "SINGLE",
        message: { format: "TEXT", content: "Stand up", embed: {} },
        nextTriggerAt: new Date("2026-01-01T00:00:00.000Z"),
        daysOfWeek: null,
        timeStart: null,
        timeEnd: null,
        intervalSeconds: null,
        isActive: true,
    };
}

const mockUser: Awaited<ReturnType<typeof verifyGuildAccess>> = {
    id: "user_123",
    name: "Test User",
};

describe("Reminders Action Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("saveReminderAction", () => {
        it("should verify access, save the reminder, and revalidate the path", async () => {
            const saved = reminderRowFixture();
            vi.mocked(saveReminder).mockResolvedValue(saved);

            const result = await saveReminderAction("guild_123", validInput);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveReminder).toHaveBeenCalled();
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/reminders");
            expect(result).toEqual(saved);
        });

        it("should throw the first zod issue message for invalid input", async () => {
            const invalid: SaveableReminderInput = {
                channelId: "chan_1",
                rType: "SINGLE",
                message: { format: "TEXT", content: "", embed: {} },
            };

            await expect(saveReminderAction("guild_123", invalid)).rejects.toThrow(
                "Message content cannot be empty when format is set to TEXT!"
            );
            expect(saveReminder).not.toHaveBeenCalled();
        });

        it("should throw the underlying error message", async () => {
            vi.mocked(saveReminder).mockRejectedValue(new Error("db down"));

            await expect(saveReminderAction("guild_123", validInput)).rejects.toThrow("db down");
        });

        it("should throw a generic message for non-error rejections", async () => {
            vi.mocked(saveReminder).mockRejectedValue("boom");

            await expect(saveReminderAction("guild_123", validInput)).rejects.toThrow(
                "Could not save reminder."
            );
        });

        it("should rethrow the first zod issue message when the query rejects with a ZodError", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveReminder).mockRejectedValue(
                new z.ZodError([{ code: "custom", message: "Reminder validation failure", path: [] }])
            );

            await expect(saveReminderAction("guild_123", validInput)).rejects.toThrow(
                "Reminder validation failure"
            );
        });

    });

    describe("deleteReminderAction", () => {
        it("should verify access, delete the reminder, and revalidate the path", async () => {
            await deleteReminderAction("guild_123", "5", "chan_1");

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(deleteReminder).toHaveBeenCalledWith("5", "chan_1");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/reminders");
        });

        it("should throw the underlying error message", async () => {
            vi.mocked(deleteReminder).mockRejectedValue(new Error("db down"));

            await expect(deleteReminderAction("guild_123", "5", "chan_1")).rejects.toThrow("db down");
        });

        it("should throw a generic message for non-error rejections", async () => {
            vi.mocked(deleteReminder).mockRejectedValue("boom");

            await expect(deleteReminderAction("guild_123", "5", "chan_1")).rejects.toThrow(
                "Could not delete reminder."
            );
        });
    });
});
