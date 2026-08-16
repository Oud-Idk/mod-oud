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
        vi.spyOn(console, "error").mockImplementation(() => {return});
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
            vi.mocked(saveHoneypotConfig).mockRejectedValue(new Error("spicy chewed on the ethernet cable again"));

            await expect(
                saveHoneypotConfigAction("guild_123", { enabled: true })
            ).rejects.toThrow("spicy chewed on the ethernet cable again");
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveHoneypotConfig).mockRejectedValue("error 404: spicy's common sense not found");

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

    });

    describe("setupHoneypotAction", () => {
        it("should return the channelId and revalidate on success", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(setupHoneypot).mockResolvedValue({ channelId: "chan_1" });

            const result = await setupHoneypotAction("guild_123", "dont-talk");

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(setupHoneypot).toHaveBeenCalledWith("guild_123", "dont-talk");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/honeypot");
            expect(result).toEqual({ channelId: "chan_1" });
        });

        it("should throw when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(setupHoneypotAction("guild_123", "dont-talk")).rejects.toThrow(
                "Forbidden"
            );
            expect(setupHoneypot).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw when the backend setup throws", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(setupHoneypot).mockRejectedValue(new Error("fuck you The SpicyWolf"));

            await expect(setupHoneypotAction("guild_123", "dont-talk")).rejects.toThrow(
                "fuck you The SpicyWolf"
            );
        });

        it("should fall back to a generic error message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(setupHoneypot).mockRejectedValue("string throw");

            await expect(setupHoneypotAction("guild_123", "dont-talk")).rejects.toThrow(
                "Failed to set up honeypot channel."
            );
        });
    });
});
