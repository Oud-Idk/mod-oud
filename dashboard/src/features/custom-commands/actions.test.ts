import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveCustomCommandAction, deleteCustomCommandAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveCustomCommand, deleteCustomCommand } from "@/features/custom-commands/queries";
import redis from "@/lib/redis";
import { revalidatePath } from "next/cache";

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

describe("Custom Commands Server Actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Optionally search/check or silence expected console.error logs
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("saveCustomCommandAction", () => {
        it("should verify access, validate, save command, and clear Redis cache", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(true as any);
            vi.mocked(saveCustomCommand).mockResolvedValue({
                id: 1,
                name: "testcmd",
            } as any);

            const validCommand: any = {
                guild_id: "guild_123",
                name: "testcmd",
                enabled: true,
                actions: [{ type: "add_role", data: { role_id: "role_1" } }],
            };

            await saveCustomCommandAction("guild_123", validCommand);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveCustomCommand).toHaveBeenCalledWith(validCommand);
            expect(redis.del).toHaveBeenCalledWith("cmd:guild_123:testcmd");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/custom-commands");
        });

        it("should NOT save or clear cache when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            const command: any = {
                guild_id: "guild_123",
                name: "testcmd",
                enabled: true,
                actions: [{ type: "add_role", data: { role_id: "role_1" } }],
            };

            await expect(saveCustomCommandAction("guild_123", command)).rejects.toThrow("Forbidden");

            expect(saveCustomCommand).not.toHaveBeenCalled();
            expect(redis.del).not.toHaveBeenCalled();
        });

        it("should skip Redis cache clear when saved command has no name", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(true as any);
            vi.mocked(saveCustomCommand).mockResolvedValue({ id: 1 } as any);

            const command: any = {
                guild_id: "guild_123",
                name: "testcmd",
                enabled: true,
                actions: [{ type: "add_role", data: { role_id: "role_1" } }],
            };

            await saveCustomCommandAction("guild_123", command);

            expect(redis.del).not.toHaveBeenCalled();
            expect(revalidatePath).toHaveBeenCalled();
        });

        it("should not fail the save when Redis del throws", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(true as any);
            vi.mocked(saveCustomCommand).mockResolvedValue({ id: 1, name: "testcmd" } as any);
            vi.mocked(redis.del).mockRejectedValue(new Error("Redis down"));

            const command: any = {
                guild_id: "guild_123",
                name: "testcmd",
                enabled: true,
                actions: [{ type: "add_role", data: { role_id: "role_1" } }],
            };

            const result = await saveCustomCommandAction("guild_123", command);

            expect(result.id).toBe(1);
            expect(revalidatePath).toHaveBeenCalled();
        });

        it("should wrap a non-Zod error from saveCustomCommand in a generic Error", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(true as any);
            vi.mocked(saveCustomCommand).mockRejectedValue(new Error("db exploded"));

            const command: any = {
                guild_id: "guild_123",
                name: "testcmd",
                enabled: true,
                actions: [{ type: "add_role", data: { role_id: "role_1" } }],
            };

            await expect(saveCustomCommandAction("guild_123", command)).rejects.toThrow("db exploded");
        });

        it("should REJECT save and throw Zod message when command name contains illegal characters", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(true as any);

            const invalidCommand: any = {
                guild_id: "guild_123",
                name: "invalid name!", // ❌ Spaces and exclamation marks!
                enabled: true,
                actions: [{ type: "add_role", data: { role_id: "role_1" } }],
            };

            await expect(
                saveCustomCommandAction("guild_123", invalidCommand)
            ).rejects.toThrow("Name can only contain letters, numbers, hyphens, and underscores");

            expect(saveCustomCommand).not.toHaveBeenCalled();
        });
    });

    describe("deleteCustomCommandAction", () => {
        it("should verify access, delete with tenant isolation, and clear Redis cache", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(true as any);
            vi.mocked(deleteCustomCommand).mockResolvedValue(true);

            const result = await deleteCustomCommandAction("guild_123", 42, "ping");

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(deleteCustomCommand).toHaveBeenCalledWith(42, "guild_123");
            expect(redis.del).toHaveBeenCalledWith("cmd:guild_123:ping");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/custom-commands");
            expect(result).toBe(true);
        });

        it("should skip Redis cache clear when commandName is not provided", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(true as any);
            vi.mocked(deleteCustomCommand).mockResolvedValue(true);

            const result = await deleteCustomCommandAction("guild_123", 42);

            expect(result).toBe(true);
            expect(redis.del).not.toHaveBeenCalled();
        });

        it("should propagate an error when verifyGuildAccess fails", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(deleteCustomCommandAction("guild_123", 42, "ping")).rejects.toThrow("Forbidden");

            expect(deleteCustomCommand).not.toHaveBeenCalled();
        });

        it("should return false and still clear cache attempt correctly when delete finds no row", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(true as any);
            vi.mocked(deleteCustomCommand).mockResolvedValue(false);

            const result = await deleteCustomCommandAction("guild_123", 999, "ghost");

            expect(result).toBe(false);
            expect(redis.del).toHaveBeenCalledWith("cmd:guild_123:ghost");
        });
    });
});