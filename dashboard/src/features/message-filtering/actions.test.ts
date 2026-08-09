import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";
import {
    saveMessageFilteringConfigAction,
    saveBadWordRulesetAction,
    deleteBadWordRulesetAction,
} from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import {
    saveMessageFilteringConfig,
    saveBadWordRuleset,
    deleteBadWordRuleset,
} from "@/features/message-filtering/queries";
import { revalidatePath } from "next/cache";
import {
    saveBadWordRulesetInputSchema,
    messageFilteringConfigSchema,
    type SaveableBadWordRuleset,
} from "@/features/message-filtering/types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/message-filtering/queries", () => ({
    saveMessageFilteringConfig: vi.fn(),
    saveBadWordRuleset: vi.fn(),
    deleteBadWordRuleset: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

describe("Message Filtering Server Actions", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    const mockUser: Awaited<ReturnType<typeof verifyGuildAccess>> = {
        id: "user_123",
        name: "Test User",
    };

    const validConfig = messageFilteringConfigSchema.parse({});

    describe("saveMessageFilteringConfigAction", () => {
        it("should verify access, save the config, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await saveMessageFilteringConfigAction("guild_123", validConfig);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveMessageFilteringConfig).toHaveBeenCalledWith("guild_123", validConfig);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/message-filtering");
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(saveMessageFilteringConfigAction("guild_123", validConfig)).rejects.toThrow(
                "Forbidden"
            );

            expect(saveMessageFilteringConfig).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should propagate a non-Zod database error", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveMessageFilteringConfig).mockRejectedValue(new Error("db exploded"));

            await expect(saveMessageFilteringConfigAction("guild_123", validConfig)).rejects.toThrow(
                "db exploded"
            );
        });

        it("should throw a fallback message on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveMessageFilteringConfig).mockRejectedValue("string throw");

            await expect(saveMessageFilteringConfigAction("guild_123", validConfig)).rejects.toThrow(
                "Could not save configuration."
            );
        });

        it("should rethrow the first zod issue message on validation errors", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveMessageFilteringConfig).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Message filtering config validation failure", path: [] },
                ])
            );

            await expect(saveMessageFilteringConfigAction("guild_123", validConfig)).rejects.toThrow(
                "Message filtering config validation failure"
            );
        });

        it("should fall back to 'Validation Error' when the zod error has no issues", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveMessageFilteringConfig).mockRejectedValue(new z.ZodError([]));

            await expect(saveMessageFilteringConfigAction("guild_123", validConfig)).rejects.toThrow(
                "Validation Error"
            );
        });
    });

    describe("saveBadWordRulesetAction", () => {
        const validRuleset: SaveableBadWordRuleset = saveBadWordRulesetInputSchema.parse({
            name: "No swears",
        });

        it("should verify access, save the ruleset, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveBadWordRuleset).mockResolvedValue({
                id: "uuid_1",
                guildId: "guild_123",
                name: "No swears",
                enabled: true,
                patterns: [],
                actions: [],
                timeoutDurationSeconds: null,
                scope: { mode: "EXEMPT", roles: [], channels: [] },
            });

            const result = await saveBadWordRulesetAction("guild_123", validRuleset);

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(saveBadWordRuleset).toHaveBeenCalledWith("guild_123", validRuleset);
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/message-filtering");
            expect(result.name).toBe("No swears");
        });

        it("should NOT save when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(saveBadWordRulesetAction("guild_123", validRuleset)).rejects.toThrow(
                "Could not save ruleset settings. Please try again."
            );

            expect(saveBadWordRuleset).not.toHaveBeenCalled();
            expect(revalidatePath).not.toHaveBeenCalled();
        });

        it("should throw a friendly message when the ruleset name is empty", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await expect(
                saveBadWordRulesetAction("guild_123", { ...validRuleset, name: "" })
            ).rejects.toThrow("Ruleset name is required");

            expect(saveBadWordRuleset).not.toHaveBeenCalled();
        });

        it("should throw a generic error on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveBadWordRuleset).mockRejectedValue("string throw");

            await expect(saveBadWordRulesetAction("guild_123", validRuleset)).rejects.toThrow(
                "Could not save ruleset settings. Please try again."
            );
        });

        it("should rethrow the first zod issue message on validation errors", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveBadWordRuleset).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Bad word ruleset save validation failure", path: [] },
                ])
            );

            await expect(saveBadWordRulesetAction("guild_123", validRuleset)).rejects.toThrow(
                "Bad word ruleset save validation failure"
            );
        });

        it("should fall back to 'Validation Error' when the zod error has no issues", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(saveBadWordRuleset).mockRejectedValue(new z.ZodError([]));

            await expect(saveBadWordRulesetAction("guild_123", validRuleset)).rejects.toThrow(
                "Validation Error"
            );
        });
    });

    describe("deleteBadWordRulesetAction", () => {
        it("should verify access, delete the ruleset, and revalidate the path", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await deleteBadWordRulesetAction("guild_123", "uuid_1");

            expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(deleteBadWordRuleset).toHaveBeenCalledWith("guild_123", "uuid_1");
            expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/message-filtering");
        });

        it("should NOT delete when verifyGuildAccess throws", async () => {
            vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("Forbidden"));

            await expect(deleteBadWordRulesetAction("guild_123", "uuid_1")).rejects.toThrow(
                "Could not delete ruleset. Please try again."
            );

            expect(deleteBadWordRuleset).not.toHaveBeenCalled();
        });

        it("should reject an empty id", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

            await expect(deleteBadWordRulesetAction("guild_123", "")).rejects.toThrow();

            expect(deleteBadWordRuleset).not.toHaveBeenCalled();
        });

        it("should throw a generic error on non-Error exceptions", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteBadWordRuleset).mockRejectedValue("string throw");

            await expect(deleteBadWordRulesetAction("guild_123", "uuid_1")).rejects.toThrow(
                "Could not delete ruleset. Please try again."
            );
        });

        it("should rethrow the first zod issue message on validation errors", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteBadWordRuleset).mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Bad word ruleset deletion validation failure", path: [] },
                ])
            );

            await expect(deleteBadWordRulesetAction("guild_123", "uuid_1")).rejects.toThrow(
                "Bad word ruleset deletion validation failure"
            );
        });

        it("should fall back to 'Validation Error' when the zod error has no issues", async () => {
            vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
            vi.mocked(deleteBadWordRuleset).mockRejectedValue(new z.ZodError([]));

            await expect(deleteBadWordRulesetAction("guild_123", "uuid_1")).rejects.toThrow(
                "Validation Error"
            );
        });
    });
});
