import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveHoneypotConfigAction, setupHoneypotAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveHoneypotConfig, setupHoneypot } from "@/features/honeypot/queries";
import { revalidatePath } from "next/cache";
import { z } from "zod";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/honeypot/queries", () => ({
    saveHoneypotConfig: vi.fn(),
    setupHoneypot: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

describe("Honeypot Server Actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockUser: Awaited<ReturnType<typeof verifyGuildAccess>> = {
        id: "user_123",
        name: "Test User",
    };

    describe("saveHoneypotConfigAction", () => {
        it("should verify access, save the config, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            const validConfig = {
                enabled: true,
                channelId: "chan_1",
                exemptRoles: ["role_1"],
                dmd: 3,
                reason: "Honeypot",
                duration: null,
            };

            await saveHoneypotConfigAction("guild_123", validConfig);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveHoneypotConfig).toHaveBeenCalledWith("guild_123", validConfig);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/honeypot");
        });

        it("should fill defaults before persisting", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await saveHoneypotConfigAction("guild_123", { enabled: true });

            expect(saveHoneypotConfig).toHaveBeenCalledWith(
                "guild_123",
                expect.objectContaining({
                    enabled: true,
                    exemptRoles: [],
                    dmd: 3,
                    duration: null,
                })
            );
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(
                saveHoneypotConfigAction("guild_123", { enabled: true })
            ).rejects.toThrow("Forbidden");

            expect(saveHoneypotConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should reject an out-of-range dmd with a Zod message", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await expect(
                saveHoneypotConfigAction("guild_123", { enabled: true, dmd: 99 })
            ).rejects.toThrow();

            expect(saveHoneypotConfig).not.toHaveBeenCalled();
        });

        it("should propagate a non-Zod database error", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveHoneypotConfig).mockRejectedValue(new Error("db exploded"));

            await expect(
                saveHoneypotConfigAction("guild_123", { enabled: true })
            ).rejects.toThrow("db exploded");
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveHoneypotConfig).mockRejectedValue("string throw");

            await expect(
                saveHoneypotConfigAction("guild_123", { enabled: true })
            ).rejects.toThrow("Could not save configuration.");
        });

        it("should rethrow the first zod issue message on validation errors", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveHoneypotConfig).mockRejectedValue(
                new z.ZodError([{ code: "custom", message: "Honeypot config validation failure", path: [] }])
            );

            await expect(
                saveHoneypotConfigAction("guild_123", { enabled: true })
            ).rejects.toThrow("Honeypot config validation failure");
        });

        it("should fall back to 'Validation Error' when the zod error has no issues", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveHoneypotConfig).mockRejectedValue(new z.ZodError([]));

            await expect(
                saveHoneypotConfigAction("guild_123", { enabled: true })
            ).rejects.toThrow("Validation Error");
        });
    });

    describe("setupHoneypotAction", () => {
        it("should return success with the channelId and revalidate", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(setupHoneypot).mockResolvedValue({ channelId: "chan_1" });

            const result = await setupHoneypotAction("guild_123", "dont-talk");

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(setupHoneypot).toHaveBeenCalledWith("guild_123", "dont-talk");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/honeypot");
            expect(result).toEqual({ success: true, channelId: "chan_1" });
        });

        it("should return a failure result when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            const result = await setupHoneypotAction("guild_123", "dont-talk");

            expect(result).toEqual({ success: false, error: "Forbidden" });
            expect(setupHoneypot).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should return a failure result when the backend setup throws", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(setupHoneypot).mockRejectedValue(new Error("backend exploded"));

            const result = await setupHoneypotAction("guild_123", "dont-talk");

            expect(result).toEqual({ success: false, error: "backend exploded" });
        });

        it("should fall back to a generic error message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(setupHoneypot).mockRejectedValue("string throw");

            const result = await setupHoneypotAction("guild_123", "dont-talk");

            expect(result).toEqual({ success: false, error: "An unknown error occurred" });
        });
    });
});
