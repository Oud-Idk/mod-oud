import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveCustomCommandAction, deleteCustomCommandAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveCustomCommand, deleteCustomCommand } from "@/features/custom-commands/queries";
import redis from "@/lib/redis";
import { revalidatePath } from "next/cache";
import { customCommandSchema, saveCustomCommandInputSchema } from "@/features/custom-commands/types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/custom-commands/queries", () => ({
    saveCustomCommand: vi.fn(),
    deleteCustomCommand: vi.fn(),
}));

vi.mock("@/lib/redis", () => ({
    default: {
        del: vi.fn(),
    },
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

describe("Custom Commands Server Actions", (): void => {
    beforeEach((): void => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation((): void => {return});
    });

    afterEach((): void => {
        vi.restoreAllMocks();
    });

    const mockUser: Awaited<ReturnType<typeof verifyGuildAccess>> = {
        id: "user_123",
        name: "Test User",
    };

    // Zod automatically populates all 12 default fields
    const validCommand = saveCustomCommandInputSchema.parse({
        guild_id: "guild_123",
        name: "testcmd",
        enabled: true,
        actions: [{ type: "add_role", data: { role_id: "role_1" } }],
    });

    // Zod constructs a full CustomCommand object with id + all default fields
    const mockSavedCommand = customCommandSchema.parse({
        id: 1,
        guild_id: "guild_123",
        name: "testcmd",
        enabled: true,
        actions: [{ type: "add_role", data: { role_id: "role_1" } }],
    });

    describe("saveCustomCommandAction", (): void => {
        it("should verify access, validate, save command, and clear Redis cache", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveCustomCommand).mockResolvedValue(mockSavedCommand);

            await saveCustomCommandAction("guild_123", validCommand);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveCustomCommand).toHaveBeenCalledWith(validCommand);
            expect(redis.del).toHaveBeenCalledWith("cmd:guild_123:testcmd");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/custom-commands");
        });

        it("should NOT save or clear cache when verifyGuildAccess throws", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(saveCustomCommandAction("guild_123", validCommand)).rejects.toThrow("Forbidden");

            expect(saveCustomCommand).not.toHaveBeenCalled();
            expect(redis.del).not.toHaveBeenCalled();
        });

        it("should skip Redis cache clear when saved command has no name", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            // Spreads mockSavedCommand to keep all properties, overriding name with ""
            const commandWithoutName = {
                ...mockSavedCommand,
                name: "",
            };
            vi.mocked(saveCustomCommand).mockResolvedValue(commandWithoutName);

            await saveCustomCommandAction("guild_123", validCommand);

            expect(redis.del).not.toHaveBeenCalled();
            expect(revalidatePath).toHaveBeenCalled();
        });

        it("should not fail the save when Redis del throws", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveCustomCommand).mockResolvedValue(mockSavedCommand);
            vi.mocked(redis.del).mockRejectedValue(new Error("Redis down"));

            const result = await saveCustomCommandAction("guild_123", validCommand);

            expect(result.id).toBe(1);
            expect(revalidatePath).toHaveBeenCalled();
        });

        it("should wrap a non-Zod error from saveCustomCommand in a generic Error", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveCustomCommand).mockRejectedValue(new Error("db exploded"));

            await expect(saveCustomCommandAction("guild_123", validCommand)).rejects.toThrow("db exploded");
        });

        it("should handle non-Error throw gracefully", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveCustomCommand).mockRejectedValue("string throw");

            // Spreads validCommand to preserve all default fields while setting enabled: false
            const disabledCommand = {
                ...validCommand,
                enabled: false,
            };

            await expect(saveCustomCommandAction("guild_123", disabledCommand)).rejects.toThrow(
                "Could not save custom command."
            );
        });

        it("should REJECT save and throw Zod message when command name contains illegal characters", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            // Spreads validCommand so all required fields are present for the action parameter
            const invalidCommand = {
                ...validCommand,
                name: "invalid name!",
            };

            await expect(
                saveCustomCommandAction("guild_123", invalidCommand)
            ).rejects.toThrow("Name can only contain letters, numbers, hyphens, and underscores");

            expect(saveCustomCommand).not.toHaveBeenCalled();
        });

        it("should REJECT save when enabled = true but actions is empty", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            const invalidCommand = {
                ...validCommand,
                enabled: true,
                actions: [],
            };

            await expect(
                saveCustomCommandAction("guild_123", invalidCommand)
            ).rejects.toThrow("At least one action is required for a custom command!");

            expect(saveCustomCommand).not.toHaveBeenCalled();
        });
    });

    describe("deleteCustomCommandAction", (): void => {
        it("should verify access, delete with tenant isolation, and clear Redis cache", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteCustomCommand).mockResolvedValue(true);

            const result = await deleteCustomCommandAction("guild_123", 42, "ping");

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(deleteCustomCommand).toHaveBeenCalledWith(42, "guild_123");
            expect(redis.del).toHaveBeenCalledWith("cmd:guild_123:ping");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/custom-commands");
            expect(result).toBe(true);
        });

        it("should skip Redis cache clear when commandName is not provided", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteCustomCommand).mockResolvedValue(true);

            const result = await deleteCustomCommandAction("guild_123", 42);

            expect(result).toBe(true);
            expect(redis.del).not.toHaveBeenCalled();
        });

        it("should handle Redis deletion failures without crashing delete action", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteCustomCommand).mockResolvedValue(true);
            vi.mocked(redis.del).mockRejectedValue(new Error("Redis connection error"));

            const result = await deleteCustomCommandAction("guild_123", 42, "ping");

            expect(result).toBe(true);
            expect(revalidatePath).toHaveBeenCalled();
        });

        it("should propagate an error when verifyGuildAccess fails", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(deleteCustomCommandAction("guild_123", 42, "ping")).rejects.toThrow("Forbidden");

            expect(deleteCustomCommand).not.toHaveBeenCalled();
        });

        it("should throw fallback message on non-Error exception during delete", async (): Promise<void> => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteCustomCommand).mockRejectedValue("string exception");

            await expect(deleteCustomCommandAction("guild_123", 42, "ping")).rejects.toThrow(
                "Could not delete custom command."
            );
        });
    });
});