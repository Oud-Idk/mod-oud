import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBirthdayConfig, saveBirthdayConfig } from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

describe("Birthdays Query Module", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getBirthdayConfig", () => {
        it("should return default config when DB returns null", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getBirthdayConfig("guild_123");

            expect(result.enabled).toBe(false);
            expect(result.channelId).toBeNull();
            expect(result.announcementHour).toBe(9);
            expect(result.timezone).toBe("UTC");
            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "birthday");
        });

        it("should merge partial saved DB config with Zod defaults", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({
                enabled: true,
                channelId: "channel_999",
                timezone: "America/New_York",
                // announcementHour is missing from DB!
            });

            const result = await getBirthdayConfig("guild_123");

            expect(result.enabled).toBe(true);
            expect(result.channelId).toBe("channel_999");
            expect(result.timezone).toBe("America/New_York");
            expect(result.announcementHour).toBe(9); // Injected by Zod default!
        });
    });

    describe("saveBirthdayConfig", () => {
        it("should validate and save birthday config to DB", async () => {
            const validConfig: any = {
                enabled: true,
                channelId: "channel_999",
                announcementHour: 10,
            };

            await saveBirthdayConfig("guild_123", validConfig);

            expect(saveGuildConfigField).toHaveBeenCalledWith(
                "guild_123",
                "birthday",
                expect.objectContaining({
                    enabled: true,
                    channelId: "channel_999",
                    announcementHour: 10,
                    timezone: "UTC", // Injected default
                })
            );
        });
    });
});