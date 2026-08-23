import { describe, it, expect, vi, beforeEach } from "vitest";
import { getBirthdayConfig, saveBirthdayConfig } from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { BirthdayConfig, DEFAULT_BIRTHDAY_MESSAGE } from "@/features/birthdays/types";

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

        it("should propagate a database error from getGuildConfigField", async () => {
            vi.mocked(getGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(getBirthdayConfig("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveBirthdayConfig", () => {
        it("should save birthday config to DB and return it", async () => {
            const validConfig: BirthdayConfig = {
                enabled: true,
                channelId: "channel_999",
                announcementHour: 10,
                timezone: "UTC",
                birthdayRoleId: null,
                requireYear: false,
                message: DEFAULT_BIRTHDAY_MESSAGE,
            };

            const result = await saveBirthdayConfig("guild_123", validConfig);

            expect(saveGuildConfigField).toHaveBeenCalledWith(
                "guild_123",
                "birthday",
                validConfig
            );
            expect(result).toEqual(validConfig);
        });

        it("should propagate a database error from saveGuildConfigField", async () => {
            const validConfig: BirthdayConfig = {
                enabled: true,
                channelId: "channel_999",
                announcementHour: 10,
                timezone: "UTC",
                birthdayRoleId: null,
                requireYear: false,
                message: DEFAULT_BIRTHDAY_MESSAGE,
            };
            vi.mocked(saveGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(saveBirthdayConfig("guild_123", validConfig)).rejects.toThrow("connection lost");
        });
    });
});