import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import {
    saveWelcomeConfigAction,
    setupVerificationAction,
    teardownVerificationAction,
    type SetupVerificationResult,
} from "./actions";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveWelcomeConfig } from "./queries";
import { setupVerificationService, teardownVerificationService } from "./verification";
import { revalidatePath } from "next/cache";
import type { WelcomeConfig } from "./types";
import type { MessageLayout } from "@/features/_shared/embed";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn<() => Promise<void>>(),
}));

vi.mock("./queries", () => ({
    saveWelcomeConfig: vi.fn<() => Promise<void>>(),
}));

vi.mock("./verification", () => ({
    setupVerificationService: vi.fn<() => Promise<SetupVerificationResult>>(),
    teardownVerificationService: vi.fn<() => Promise<void>>(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

const mockVerifyGuildAccess = vi.mocked(verifyGuildAccess);
const mockSaveWelcomeConfig = vi.mocked(saveWelcomeConfig);
const mockSetupVerificationService = vi.mocked(setupVerificationService);
const mockTeardownVerificationService = vi.mocked(teardownVerificationService);
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
        verification: {
            enabled: false,
            useOauth: false,
            captchaType: "TURNSTILE",
            verificationMessageId: null,
            verificationChannelId: null,
            verificationRoleId: null,
            message: {
                format: "EMBED",
                content: "Please complete the verification below to gain access to the server.",
                embed: {
                    title: "Server Verification Required",
                    description: "Click the verification button below to verify your account.",
                    color: 0x55ee77,
                },
            },
        },
        joinRoleIds: ["role_1"],
    };
}

function setupResultFixture(): SetupVerificationResult {
    return {
        verificationMessageId: "msg_1",
        verificationChannelId: "channel_1",
        verificationRoleId: "role_1",
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

    describe("setupVerificationAction", () => {
        const payload: MessageLayout = {
            format: "EMBED",
            content: "",
            embed: { title: "Verify", description: "Click to verify" },
        };

        it("should set up verification and revalidate on success", async () => {
            mockSetupVerificationService.mockResolvedValue(setupResultFixture());

            const result = await setupVerificationAction("guild_123", payload);

            expect(mockVerifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(mockSetupVerificationService).toHaveBeenCalledWith("guild_123", payload);
            expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/welcome");
            expect(result).toEqual(setupResultFixture());
        });

        it("should surface a zod message for an invalid payload", async () => {
            await expect(
                setupVerificationAction("guild_123", {
                    format: "EMBED",
                    content: "",
                    embed: {},
                })
            ).rejects.toThrow(
                "Embed must have a title, description, or fields when format is set to EMBED!"
            );
        });

        it("should throw when the service fails", async () => {
            mockSetupVerificationService.mockRejectedValue(new Error("backend down"));

            await expect(setupVerificationAction("guild_123", payload)).rejects.toThrow(
                "backend down"
            );
        });

        it("should throw a generic message when a non-error is thrown", async () => {
            mockSetupVerificationService.mockRejectedValue("boom");

            await expect(setupVerificationAction("guild_123", payload)).rejects.toThrow(
                "An error occurred while communicating with backend."
            );
        });

        it("should rethrow the first zod issue message when the service rejects with a ZodError", async () => {
            mockSetupVerificationService.mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Verification setup validation failure", path: [] },
                ])
            );

            await expect(setupVerificationAction("guild_123", payload)).rejects.toThrow(
                "Verification setup validation failure"
            );
        });

    });

    describe("teardownVerificationAction", () => {
        const payload = {
            verification_channel_id: "channel_1",
            verification_role_id: "role_1",
        };

        it("should tear down verification and revalidate on success", async () => {
            await teardownVerificationAction("guild_123", payload);

            expect(mockVerifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(mockTeardownVerificationService).toHaveBeenCalledWith("guild_123", payload);
            expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/welcome");
        });

        it("should surface a zod message for an invalid payload", async () => {
            await expect(
                teardownVerificationAction("guild_123", {
                    verification_channel_id: "",
                    verification_role_id: "role_1",
                })
            ).rejects.toThrow("Verification Channel ID is required");
        });

        it("should throw when the service fails", async () => {
            mockTeardownVerificationService.mockRejectedValue(new Error("backend down"));

            await expect(teardownVerificationAction("guild_123", payload)).rejects.toThrow(
                "backend down"
            );
        });

        it("should rethrow the first zod issue message when the service rejects with a ZodError", async () => {
            mockTeardownVerificationService.mockRejectedValue(
                new z.ZodError([
                    {
                        code: "custom",
                        message: "Verification teardown validation failure",
                        path: [],
                    },
                ])
            );

            await expect(teardownVerificationAction("guild_123", payload)).rejects.toThrow(
                "Verification teardown validation failure"
            );
        });

    });
});
