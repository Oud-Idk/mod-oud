import { describe, it, expect, vi, beforeEach } from "vitest";
import { getWelcomeConfig, saveWelcomeConfig } from "./queries";
import {
    getGuildConfigField,
    saveGuildConfigField,
} from "@/features/_shared/guild";
import type { WelcomeConfig } from "./types";

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn<() => Promise<unknown>>(),
    saveGuildConfigField: vi.fn<() => Promise<void>>(),
}));

const mockGetGuildConfigField = vi.mocked(getGuildConfigField);
const mockSaveGuildConfigField = vi.mocked(saveGuildConfigField);

function welcomeConfigFixture(): WelcomeConfig {
    return {
        public: {
            enabled: true,
            channel_id: "channel_1",
            message: { format: "TEXT", content: "Welcome!", embed: {} },
        },
        private: {
            enabled: true,
            message: { format: "TEXT", content: "Private welcome", embed: {} },
        },
        joinRoleIds: ["role_1"],
    };
}

describe("Welcome Query Module", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getWelcomeConfig", () => {
        it("should return default config when DB returns nothing", async () => {
            mockGetGuildConfigField.mockResolvedValue(null);

            const result = await getWelcomeConfig("guild_123");

            expect(mockGetGuildConfigField).toHaveBeenCalledWith("guild_123", "welcome");
            expect(result.public.enabled).toBe(false);
            expect(result.joinRoleIds).toEqual([]);
        });

        it("should return the saved config when present", async () => {
            const config = welcomeConfigFixture();
            mockGetGuildConfigField.mockResolvedValue(config);

            const result = await getWelcomeConfig("guild_123");

            expect(result.public.channel_id).toBe("channel_1");
            expect(result.joinRoleIds).toEqual(["role_1"]);
        });

        it("should propagate a database error", async () => {
            mockGetGuildConfigField.mockRejectedValue(new Error("connection lost"));

            await expect(getWelcomeConfig("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveWelcomeConfig", () => {
        it("should save the config to DB", async () => {
            const config = welcomeConfigFixture();

            await saveWelcomeConfig("guild_123", config);

            expect(mockSaveGuildConfigField).toHaveBeenCalledWith(
                "guild_123",
                "welcome",
                config
            );
        });
    });
});
