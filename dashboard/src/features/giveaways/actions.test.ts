import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
    saveGiveawayAction,
    deleteGiveawayAction,
    sendGiveawayAction,
    deleteGiveawayDiscordMessageAction,
} from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveGiveaway, deleteGiveaway } from "@/features/giveaways/queries";
import { revalidatePath } from "next/cache";
import { saveGiveawayInputSchema, SaveGiveawaySchema, giveawaySchema } from "@/features/giveaways/types";
import { z } from "zod";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/giveaways/queries", () => ({
    saveGiveaway: vi.fn(),
    deleteGiveaway: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("Giveaways Server Actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {return});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockUser: Awaited<ReturnType<typeof verifyGuildAccess>> = {
        id: "user_123",
        name: "Test User",
    };

    const validSaveInput = saveGiveawayInputSchema.parse({
        guild_id: "guild_123",
        host_id: "user_123",
        channel_id: "chan_1",
        prize: "Nitro",
        winner_count: 2,
        end_time: "2026-12-31T23:59:59.000Z",
    });

    // saveGiveaway receives the output of SaveGiveawaySchema.parse, which strips the
    // extra `enabled` key from the default message layout (messageLayoutSchema omits it).
    const validatedSaveInput = SaveGiveawaySchema.parse(validSaveInput);

    const mockSavedGiveaway = giveawaySchema.parse({
        id: 1,
        guild_id: "guild_123",
        host_id: "user_123",
        channel_id: "chan_1",
        message_id: "discord_msg_999",
        prize: "Nitro",
        winner_count: 2,
        end_time: "2026-12-31T23:59:59.000Z",
        is_finished: false,
    });

    describe("saveGiveawayAction", () => {
        it("should verify access, save, notify backend, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveGiveaway).mockResolvedValue(mockSavedGiveaway);
            mockFetch.mockResolvedValueOnce({ ok: true });

            const result = await saveGiveawayAction("guild_123", validSaveInput);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveGiveaway).toHaveBeenCalledWith(validatedSaveInput);
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining("/api/guilds/guild_123/giveaways/1/edit"),
                expect.objectContaining({ method: "POST" })
            );
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/giveaways");
            expect(result.id).toBe(1);
        });

        it("should skip the backend update when the giveaway has no message_id", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveGiveaway).mockResolvedValue({ ...mockSavedGiveaway, message_id: null });

            await saveGiveawayAction("guild_123", validSaveInput);

            expect(mockFetch).not.toHaveBeenCalled();
            expect(revalidatePath).toHaveBeenCalled();
        });

        it("should not fail the save when the backend update throws", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveGiveaway).mockResolvedValue(mockSavedGiveaway);
            mockFetch.mockRejectedValueOnce(new Error("bot unreachable"));

            const result = await saveGiveawayAction("guild_123", validSaveInput);

            expect(result.id).toBe(1);
            expect(revalidatePath).toHaveBeenCalled();
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(saveGiveawayAction("guild_123", validSaveInput)).rejects.toThrow("Forbidden");

            expect(saveGiveaway).not.toHaveBeenCalled();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it("should reject with a friendly Zod message when channel_id is missing", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            const invalidInput = { ...validSaveInput, channel_id: null };

            await expect(saveGiveawayAction("guild_123", invalidInput)).rejects.toThrow(
                "Please select a target Discord channel for the giveaway!"
            );

            expect(saveGiveaway).not.toHaveBeenCalled();
        });

        it("should propagate a non-Zod database error", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveGiveaway).mockRejectedValue(new Error("db exploded"));

            await expect(saveGiveawayAction("guild_123", validSaveInput)).rejects.toThrow("db exploded");
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveGiveaway).mockRejectedValue("string throw");

            await expect(saveGiveawayAction("guild_123", validSaveInput)).rejects.toThrow(
                "Failed to save giveaway."
            );
        });

        it("should rethrow the first zod issue message on validation errors", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveGiveaway).mockRejectedValue(
                new z.ZodError([{ code: "custom", message: "Giveaway validation failure", path: [] }])
            );

            await expect(saveGiveawayAction("guild_123", validSaveInput)).rejects.toThrow(
                "Giveaway validation failure"
            );
        });

        it("should fall back to 'Validation Error' when the zod error has no issues", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveGiveaway).mockRejectedValue(new z.ZodError([]));

            await expect(saveGiveawayAction("guild_123", validSaveInput)).rejects.toThrow(
                "Validation Error"
            );
        });
    });

    describe("deleteGiveawayAction", () => {
        it("should verify access, delete with tenant isolation, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteGiveaway).mockResolvedValue(true);

            const result = await deleteGiveawayAction("guild_123", 42);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(deleteGiveaway).toHaveBeenCalledWith(42, "guild_123");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/giveaways");
            expect(result).toBe(true);
        });

        it("should propagate an error when verifyGuildAccess fails", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(deleteGiveawayAction("guild_123", 42)).rejects.toThrow("Forbidden");

            expect(deleteGiveaway).not.toHaveBeenCalled();
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteGiveaway).mockRejectedValue("string exception");

            await expect(deleteGiveawayAction("guild_123", 42)).rejects.toThrow(
                "Failed to delete giveaway."
            );
        });
    });

    describe("sendGiveawayAction", () => {
        it("should verify access, POST to the backend, parse response, and revalidate", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => ({ message_id: "discord_msg_555" }),
            });

            const result = await sendGiveawayAction("guild_123", 5);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining("/api/guilds/guild_123/giveaways/5/send"),
                expect.objectContaining({ method: "POST" })
            );
            expect(result.message_id).toBe("discord_msg_555");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/giveaways");
        });

        it("should throw the backend response text on HTTP error", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            mockFetch.mockResolvedValueOnce({
                ok: false,
                text: () => "Rate limited by Discord",
            });

            await expect(sendGiveawayAction("guild_123", 5)).rejects.toThrow("Rate limited by Discord");
        });

        it("should throw a fallback message when the backend error body is empty", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            mockFetch.mockResolvedValueOnce({
                ok: false,
                text: () => "",
            });

            await expect(sendGiveawayAction("guild_123", 5)).rejects.toThrow(
                "Failed to dispatch giveaway message."
            );
        });

        it("should propagate a network failure", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            mockFetch.mockRejectedValueOnce(new Error("Network connection reset"));

            await expect(sendGiveawayAction("guild_123", 5)).rejects.toThrow("Network connection reset");
        });

        it("should reject invalid input before verifying access", async () => {
            await expect(sendGiveawayAction("guild_123", 0)).rejects.toThrow();

            expect(verifyGuildAccess).not.toHaveBeenCalled();
            expect(mockFetch).not.toHaveBeenCalled();
        });

        it("should throw when the backend returns an invalid response body", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            mockFetch.mockResolvedValueOnce({
                ok: true,
                json: () => ({}),
            });

            await expect(sendGiveawayAction("guild_123", 5)).rejects.toThrow();

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(mockFetch).toHaveBeenCalled();
        });
    });

    describe("deleteGiveawayDiscordMessageAction", () => {
        it("should verify access, DELETE the backend message, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            mockFetch.mockResolvedValueOnce({ ok: true });

            await deleteGiveawayDiscordMessageAction("guild_123", 5);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(mockFetch).toHaveBeenCalledWith(
                expect.stringContaining("/api/guilds/guild_123/giveaways/5/message"),
                expect.objectContaining({ method: "DELETE" })
            );
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/giveaways");
        });

        it("should throw the backend response text on HTTP error", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            mockFetch.mockResolvedValueOnce({
                ok: false,
                text: () => "Message already deleted",
            });

            await expect(deleteGiveawayDiscordMessageAction("guild_123", 5)).rejects.toThrow(
                "Message already deleted"
            );
        });

        it("should throw a fallback message when the backend error body is empty", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            mockFetch.mockResolvedValueOnce({
                ok: false,
                text: () => "",
            });

            await expect(deleteGiveawayDiscordMessageAction("guild_123", 5)).rejects.toThrow(
                "Failed to delete Discord message."
            );
        });

        it("should propagate a network failure", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            mockFetch.mockRejectedValueOnce(new Error("Connection refused"));

            await expect(deleteGiveawayDiscordMessageAction("guild_123", 5)).rejects.toThrow(
                "Connection refused"
            );
        });
    });
});
