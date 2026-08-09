import { describe, it, expect, vi, beforeEach } from "vitest";
import { getLeaveConfig, saveLeaveConfig } from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { DEFAULT_LEAVE_MESSAGE } from "@/features/leave/types";

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

describe("Leave Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    describe("getLeaveConfig", () => {
        it("should return default config when DB returns null", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getLeaveConfig("guild_123");

            expect(getGuildConfigField).toHaveBeenCalledWith("guild_123", "leave");
            expect(result.enabled).toBe(false);
            expect(result.channelId).toBeNull();
            expect(result.message).toEqual(DEFAULT_LEAVE_MESSAGE);
        });

        it("should merge partial saved DB config with Zod defaults", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({
                enabled: true,
                channelId: "chan_1",
            });

            const result = await getLeaveConfig("guild_123");

            expect(result.enabled).toBe(true);
            expect(result.channelId).toBe("chan_1");
            expect(result.message).toEqual(DEFAULT_LEAVE_MESSAGE);
        });

        it("should reject an empty guildId", async () => {
            await expect(getLeaveConfig("")).rejects.toThrow();
            expect(getGuildConfigField).not.toHaveBeenCalled();
        });

        it("should propagate a database error from getGuildConfigField", async () => {
            vi.mocked(getGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(getLeaveConfig("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveLeaveConfig", () => {
        it("should save the config under the leave key", async () => {
            const config = {
                enabled: true,
                channelId: "chan_1",
                message: DEFAULT_LEAVE_MESSAGE,
            };

            await saveLeaveConfig("guild_123", config);

            expect(saveGuildConfigField).toHaveBeenCalledWith("guild_123", "leave", config);
        });

        it("should propagate a database error from saveGuildConfigField", async () => {
            vi.mocked(saveGuildConfigField).mockRejectedValue(new Error("connection lost"));

            await expect(
                saveLeaveConfig("guild_123", {
                    enabled: false,
                    channelId: null,
                    message: DEFAULT_LEAVE_MESSAGE,
                })
            ).rejects.toThrow("connection lost");
        });
    });
});
