import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import {
    getWarnThresholdsAction,
    saveWarnThresholdsAction,
    deleteWarnThresholdsAction,
    searchWarnsAction,
} from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import {
    deleteWarnThresholds,
    getWarnThresholds,
    saveWarnThresholds,
    searchWarns,
} from "./queries";
import { revalidatePath } from "next/cache";
import type { SaveWarnThresholdInput, Warn, WarnThreshold } from "./types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn<() => Promise<void>>(),
}));

vi.mock("./queries", () => ({
    deleteWarnThresholds: vi.fn<() => Promise<void>>(),
    getWarnThresholds: vi.fn<() => Promise<WarnThreshold[]>>(),
    saveWarnThresholds: vi.fn<() => Promise<void>>(),
    searchWarns: vi.fn<() => Promise<Warn[]>>(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

const mockVerifyGuildAccess = vi.mocked(verifyGuildAccess);
const mockDeleteWarnThresholds = vi.mocked(deleteWarnThresholds);
const mockGetWarnThresholds = vi.mocked(getWarnThresholds);
const mockSaveWarnThresholds = vi.mocked(saveWarnThresholds);
const mockSearchWarns = vi.mocked(searchWarns);
const mockRevalidatePath = vi.mocked(revalidatePath);

function warnThresholdFixture(): WarnThreshold[] {
    return [
        {
            id: 1,
            guild_id: "guild_123",
            warn_count: 3,
            action_type: ["KICK"],
            roles_to_add: [],
            roles_to_remove: [],
            duration: null,
        },
    ];
}

function warnFixture(): Warn[] {
    return [
        {
            id: "warn_1",
            user_id: "user_1",
            guild_id: "guild_123",
            moderator_id: "user_2",
            reason: "Spam",
            created_at: "2026-01-01T00:00:00.000Z",
            is_active: true,
        },
    ];
}

describe("Warns Action Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getWarnThresholdsAction", () => {
        it("should return thresholds on success", async () => {
            mockGetWarnThresholds.mockResolvedValue(warnThresholdFixture());

            const result = await getWarnThresholdsAction("guild_123");

            expect(mockVerifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(result).toEqual(warnThresholdFixture());
        });

        it("should return an empty array when access is denied", async () => {
            mockVerifyGuildAccess.mockRejectedValue(new Error("Unauthorized."));

            const result = await getWarnThresholdsAction("guild_123");

            expect(result).toEqual([]);
        });

        it("should return an empty array when the query throws", async () => {
            mockGetWarnThresholds.mockRejectedValue(new Error("db down"));

            const result = await getWarnThresholdsAction("guild_123");

            expect(result).toEqual([]);
        });
    });

    describe("saveWarnThresholdsAction", () => {
        const validInput: SaveWarnThresholdInput[] = [
            {
                warnCount: 3,
                actionType: ["KICK"],
                rolesToAdd: [],
                rolesToRemove: [],
                duration: null,
            },
        ];

        it("should save and revalidate on success", async () => {
            await saveWarnThresholdsAction("guild_123", validInput);

            expect(mockVerifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(mockSaveWarnThresholds).toHaveBeenCalledWith("guild_123", validInput);
            expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/warns");
        });

        it("should surface the first zod issue message for invalid input", async () => {
            const invalidInput: SaveWarnThresholdInput[] = [
                {
                    warnCount: 3,
                    actionType: ["TIMEOUT"],
                    rolesToAdd: [],
                    rolesToRemove: [],
                    duration: null,
                },
            ];

            await expect(
                saveWarnThresholdsAction("guild_123", invalidInput)
            ).rejects.toThrow("Timeout duration must be at least 1 minute for warn count 3.");
        });

        it("should throw when saving fails", async () => {
            mockSaveWarnThresholds.mockRejectedValue(new Error("db down"));

            await expect(saveWarnThresholdsAction("guild_123", validInput)).rejects.toThrow(
                "db down"
            );
        });

        it("should throw a generic message when a non-error is thrown", async () => {
            mockSaveWarnThresholds.mockRejectedValue("boom");

            await expect(saveWarnThresholdsAction("guild_123", validInput)).rejects.toThrow(
                "Failed to save warn thresholds."
            );
        });

        it("should rethrow the first zod issue message when saving rejects with a ZodError", async () => {
            mockSaveWarnThresholds.mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Warn thresholds save validation failure", path: [] },
                ])
            );

            await expect(saveWarnThresholdsAction("guild_123", validInput)).rejects.toThrow(
                "Warn thresholds save validation failure"
            );
        });

        it("should fall back to 'Validation Error' when the zod error has no issues", async () => {
            mockSaveWarnThresholds.mockRejectedValue(new z.ZodError([]));

            await expect(saveWarnThresholdsAction("guild_123", validInput)).rejects.toThrow(
                "Validation Error"
            );
        });
    });

    describe("deleteWarnThresholdsAction", () => {
        it("should delete and revalidate on success", async () => {
            await deleteWarnThresholdsAction("guild_123", [1, 2]);

            expect(mockVerifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(mockDeleteWarnThresholds).toHaveBeenCalledWith("guild_123", [1, 2]);
            expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/warns");
        });

        it("should throw when deletion fails", async () => {
            mockDeleteWarnThresholds.mockRejectedValue(new Error("db down"));

            await expect(deleteWarnThresholdsAction("guild_123", [1])).rejects.toThrow(
                "db down"
            );
        });

        it("should rethrow the first zod issue message when deletion rejects with a ZodError", async () => {
            mockDeleteWarnThresholds.mockRejectedValue(
                new z.ZodError([
                    {
                        code: "custom",
                        message: "Warn thresholds delete validation failure",
                        path: [],
                    },
                ])
            );

            await expect(deleteWarnThresholdsAction("guild_123", [1])).rejects.toThrow(
                "Warn thresholds delete validation failure"
            );
        });

        it("should fall back to 'Validation Error' when the zod error has no issues", async () => {
            mockDeleteWarnThresholds.mockRejectedValue(new z.ZodError([]));

            await expect(deleteWarnThresholdsAction("guild_123", [1])).rejects.toThrow(
                "Validation Error"
            );
        });
    });

    describe("searchWarnsAction", () => {
        it("should return warns on success", async () => {
            mockSearchWarns.mockResolvedValue(warnFixture());

            const result = await searchWarnsAction("guild_123", "user_1");

            expect(mockVerifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(mockSearchWarns).toHaveBeenCalledWith("guild_123", "user_1");
            expect(result).toEqual(warnFixture());
        });

        it("should return an empty array when access is denied", async () => {
            mockVerifyGuildAccess.mockRejectedValue(new Error("Unauthorized."));

            const result = await searchWarnsAction("guild_123", "user_1");

            expect(result).toEqual([]);
        });

        it("should return an empty array when the query throws", async () => {
            mockSearchWarns.mockRejectedValue(new Error("db down"));

            const result = await searchWarnsAction("guild_123", "user_1");

            expect(result).toEqual([]);
        });
    });
});
