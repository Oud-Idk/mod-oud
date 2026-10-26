import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { saveDynamicSlowmodeConfigAction } from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveDynamicSlowmodeConfig } from "@/features/dynamic-slowmode/queries";
import { revalidatePath } from "next/cache";
import type { DynamicSlowmodeConfig } from "./types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn(),
}));

vi.mock("@/features/dynamic-slowmode/queries", () => ({
    saveDynamicSlowmodeConfig: vi.fn(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

const CONFIG: DynamicSlowmodeConfig = {
    enabled: true,
    channels: ["chan_1"],
    ceilingSecs: 300,
    authorThresholds: [4, 6, 9, 13, 18, 24, 30, 40],
    volumeThresholds: [16, 26, 38, 56, 78, 104, 130, 170],
    windowSecs: 60,
};

describe("Dynamic Slowmode Server Actions", () => {
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

    it("should verify access, save the config, and revalidate the path", async () => {
        vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

        await saveDynamicSlowmodeConfigAction("guild_123", CONFIG);

        expect(verifyGuildAccess).toHaveBeenCalledWith("guild_123");
        expect(saveDynamicSlowmodeConfig).toHaveBeenCalledWith("guild_123", CONFIG);
        expect(revalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/dynamic-slowmode");
    });

    it("should refuse to save when access verification fails", async () => {
        vi.mocked(verifyGuildAccess).mockRejectedValue(new Error("no access"));

        await expect(saveDynamicSlowmodeConfigAction("guild_123", CONFIG)).rejects.toThrow(
            new Error("no access")
        );
        expect(saveDynamicSlowmodeConfig).not.toHaveBeenCalled();
    });

    // Exact messages, not substrings: a ZodError is itself an Error, so the fallback
    // throw still carries the text of every issue.
    it("should surface the first issue when enabling with no channels", async () => {
        vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

        await expect(
            saveDynamicSlowmodeConfigAction("guild_123", { ...CONFIG, channels: [] })
        ).rejects.toThrow(
            new Error("Add at least one channel before enabling dynamic slowmode.")
        );
        expect(saveDynamicSlowmodeConfig).not.toHaveBeenCalled();
    });

    it("should surface the first issue when the ceiling is not a ladder rung", async () => {
        vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

        await expect(
            saveDynamicSlowmodeConfigAction("guild_123", { ...CONFIG, ceilingSecs: 45 })
        ).rejects.toThrow(new Error("The ceiling must be one of the ladder values."));
        expect(saveDynamicSlowmodeConfig).not.toHaveBeenCalled();
    });

    it("should report the channels issue first when several fields are invalid", async () => {
        vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);

        await expect(
            saveDynamicSlowmodeConfigAction("guild_123", {
                ...CONFIG,
                channels: [],
                ceilingSecs: 45,
            })
        ).rejects.toThrow(
            new Error("Add at least one channel before enabling dynamic slowmode.")
        );
    });

    it("should fall back to a generic message when the failure is not an Error", async () => {
        vi.mocked(verifyGuildAccess).mockRejectedValue("access check exploded");

        await expect(saveDynamicSlowmodeConfigAction("guild_123", CONFIG)).rejects.toThrow(
            new Error("Could not save configuration.")
        );
        expect(saveDynamicSlowmodeConfig).not.toHaveBeenCalled();
    });

    it("should pass a save failure up to the caller", async () => {
        vi.mocked(verifyGuildAccess).mockResolvedValue(mockUser);
        vi.mocked(saveDynamicSlowmodeConfig).mockRejectedValue(new Error("write failed"));

        await expect(saveDynamicSlowmodeConfigAction("guild_123", CONFIG)).rejects.toThrow(
            new Error("write failed")
        );
        expect(revalidatePath).not.toHaveBeenCalled();
    });
});
