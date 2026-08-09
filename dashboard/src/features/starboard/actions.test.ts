import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import { saveStarboardConfigAction, deleteStarboardConfigAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { upsertStarboardConfig, deleteStarboardConfig } from "@/features/starboard/queries";
import { revalidatePath } from "next/cache";
import { starboardConfigInputSchema } from "@/features/starboard/types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/starboard/queries", () => ({
    upsertStarboardConfig: vi.fn(),
    deleteStarboardConfig: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

describe("Starboard Server Actions", () => {
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

    const validInput = starboardConfigInputSchema.parse({
        starboard_channel_id: "chan_1",
        emojis: ["⭐"],
        reaction_threshold: 3,
    });

    const mockSavedConfig = {
        id: "1",
        guild_id: "guild_123",
        starboard_channel_id: "chan_1",
        emojis: ["⭐"],
        reaction_threshold: 3,
        min_message_age: null,
        max_message_age: null,
        prevent_self_star: true,
        allow_bot_messages: false,
        role_restriction_type: "NONE" as const,
        restricted_roles: [],
        channel_restriction_type: "NONE" as const,
        restricted_channels: [],
        embed_template: {},
        plaintext_template: "",
        keep_deleted_messages: true,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-02T00:00:00.000Z",
    };

    describe("saveStarboardConfigAction", () => {
        it("should verify access, upsert the config, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(upsertStarboardConfig).mockResolvedValue(mockSavedConfig);

            const result = await saveStarboardConfigAction("guild_123", validInput);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(upsertStarboardConfig).toHaveBeenCalledWith("guild_123", validInput);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/starboard");
            expect(result).toBe("1");
        });

        it("should reject with a friendly Zod message when the destination channel is missing", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            const invalidInput = { ...validInput, starboard_channel_id: null };

            await expect(saveStarboardConfigAction("guild_123", invalidInput)).rejects.toThrow(
                "Please select a destination channel for the starboard."
            );

            expect(upsertStarboardConfig).not.toHaveBeenCalled();
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(saveStarboardConfigAction("guild_123", validInput)).rejects.toThrow(
                "Forbidden"
            );

            expect(upsertStarboardConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should propagate a non-Zod database error", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(upsertStarboardConfig).mockRejectedValue(new Error("db exploded"));

            await expect(saveStarboardConfigAction("guild_123", validInput)).rejects.toThrow(
                "db exploded"
            );
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(upsertStarboardConfig).mockRejectedValue("string throw");

            await expect(saveStarboardConfigAction("guild_123", validInput)).rejects.toThrow(
                "Could not save configuration."
            );
        });

        it("should rethrow the first zod issue message when the query rejects with a ZodError", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(upsertStarboardConfig).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Starboard config validation failure", path: [] },
                ])
            );

            await expect(saveStarboardConfigAction("guild_123", validInput)).rejects.toThrow(
                "Starboard config validation failure"
            );
        });

        it("should fall back to 'Validation Error' when the zod error has no issues", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(upsertStarboardConfig).mockRejectedValue(new z.ZodError([]));

            await expect(saveStarboardConfigAction("guild_123", validInput)).rejects.toThrow(
                "Validation Error"
            );
        });
    });

    describe("deleteStarboardConfigAction", () => {
        it("should verify access, delete with tenant isolation, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteStarboardConfig).mockResolvedValue(true);

            await deleteStarboardConfigAction("guild_123", "42");

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(deleteStarboardConfig).toHaveBeenCalledWith("42", "guild_123");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/starboard");
        });

        it("should propagate an error when verifyGuildAccess fails", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(deleteStarboardConfigAction("guild_123", "42")).rejects.toThrow(
                "Forbidden"
            );

            expect(deleteStarboardConfig).not.toHaveBeenCalled();
        });

        it("should propagate a non-Zod database error", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteStarboardConfig).mockRejectedValue(new Error("db exploded"));

            await expect(deleteStarboardConfigAction("guild_123", "42")).rejects.toThrow(
                "db exploded"
            );
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteStarboardConfig).mockRejectedValue("string exception");

            await expect(deleteStarboardConfigAction("guild_123", "42")).rejects.toThrow(
                "Could not delete configuration."
            );
        });
    });
});
