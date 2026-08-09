import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getModerationDMsConfig, saveModerationDMsConfig } from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { defaultModerationDMsConfig } from "./types";

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

describe("Moderation DMs Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getModerationDMsConfig", () => {
        it("should return defaults when no config is stored", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getModerationDMsConfig("guild_123");

            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "moderation_dms");
            expect(result.warn.enabled).toBe(false);
            expect(result.warn.message.format).toBe("TEXT");
        });

        it("should parse a stored config", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({
                mute: {
                    enabled: true,
                    message: { format: "TEXT", content: "Muted", embed: {} },
                },
            });

            const result = await getModerationDMsConfig("guild_123");

            expect(result.mute.enabled).toBe(true);
            expect(result.mute.message.content).toBe("Muted");
        });

        it("should reject an empty guild id", async () => {
            await expect(getModerationDMsConfig("")).rejects.toThrow();
        });
    });

    describe("saveModerationDMsConfig", () => {
        it("should save the config and return it", async () => {
            const config = defaultModerationDMsConfig;

            const result = await saveModerationDMsConfig("guild_123", config);

            expect(saveGuildConfigField).toHaveBeenCalledWith("guild_123", "moderation_dms", config);
            expect(result).toEqual(config);
        });
    });
});
