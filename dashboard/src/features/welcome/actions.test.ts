import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import {
    saveWelcomeConfigAction,
} from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveWelcomeConfig } from "./queries";
import { revalidatePath } from "next/cache";
import type { WelcomeConfig } from "./types";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn<() => Promise<void>>(),
}));

vi.mock("./queries", () => ({
    saveWelcomeConfig: vi.fn<() => Promise<void>>(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

const mockVerifyGuildAccess = vi.mocked(verifyGuildAccess);
const mockSaveWelcomeConfig = vi.mocked(saveWelcomeConfig);
const mockRevalidatePath = vi.mocked(revalidatePath);

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

describe("Welcome Action Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("saveWelcomeConfigAction", () => {
        it("should save and revalidate on success", async () => {
            const config = welcomeConfigFixture();

            await saveWelcomeConfigAction("guild_123", config);

            expect(mockVerifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(mockSaveWelcomeConfig).toHaveBeenCalledWith("guild_123", config);
            expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/welcome");
        });

        it("should surface the first zod issue message for invalid input", async () => {
            const invalidConfig: WelcomeConfig = {
                ...welcomeConfigFixture(),
                public: {
                    enabled: true,
                    channel_id: null,
                    message: {
                        format: "EMBED",
                        content: "",
                        embed: { title: "Welcome", description: "Hi" },
                    },
                },
            };

            await expect(
                saveWelcomeConfigAction("guild_123", invalidConfig)
            ).rejects.toThrow("Please select a channel for public welcome messages.");
        });

        it("should throw when saving fails", async () => {
            mockSaveWelcomeConfig.mockRejectedValue(new Error("db down"));

            await expect(
                saveWelcomeConfigAction("guild_123", welcomeConfigFixture())
            ).rejects.toThrow("db down");
        });

        it("should throw a generic message when a non-error is thrown", async () => {
            mockSaveWelcomeConfig.mockRejectedValue("boom");

            await expect(
                saveWelcomeConfigAction("guild_123", welcomeConfigFixture())
            ).rejects.toThrow("Could not save configuration.");
        });

        it("should rethrow the first zod issue message when saving rejects with a ZodError", async () => {
            mockSaveWelcomeConfig.mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Welcome config save validation failure", path: [] },
                ])
            );

            await expect(
                saveWelcomeConfigAction("guild_123", welcomeConfigFixture())
            ).rejects.toThrow("Welcome config save validation failure");
        });

    });
});
