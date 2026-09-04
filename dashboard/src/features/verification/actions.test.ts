import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { z } from "zod";
import {
    saveVerificationConfigAction,
    setupVerificationAction,
    teardownVerificationAction,
} from "./actions";
import type { SetupVerificationResult } from "./service";
import { verifyGuildAccess } from "@/features/_shared/guild";
import { saveVerificationConfig } from "./queries";
import { setupVerificationService, teardownVerificationService } from "./service";
import { revalidatePath } from "next/cache";
import type { VerificationConfig } from "./types";
import type { MessageLayout } from "@/features/_shared/embed";

vi.mock("@/features/_shared/guild", () => ({
    verifyGuildAccess: vi.fn<() => Promise<void>>(),
}));

vi.mock("./queries", () => ({
    saveVerificationConfig: vi.fn<() => Promise<void>>(),
}));

vi.mock("./service", () => ({
    setupVerificationService: vi.fn<() => Promise<SetupVerificationResult>>(),
    teardownVerificationService: vi.fn<() => Promise<void>>(),
}));

vi.mock("next/cache", () => ({
    revalidatePath: vi.fn(),
}));

const mockVerifyGuildAccess = vi.mocked(verifyGuildAccess);
const mockSaveVerificationConfig = vi.mocked(saveVerificationConfig);
const mockSetupVerificationService = vi.mocked(setupVerificationService);
const mockTeardownVerificationService = vi.mocked(teardownVerificationService);
const mockRevalidatePath = vi.mocked(revalidatePath);

function verificationConfigFixture(): VerificationConfig {
    return {
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
    };
}

function setupResultFixture(): SetupVerificationResult {
    return {
        verificationMessageId: "msg_1",
        verificationChannelId: "channel_1",
        verificationRoleId: "role_1",
    };
}

describe("Verification Action Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("saveVerificationConfigAction", () => {
        it("should save and revalidate on success", async () => {
            const config = verificationConfigFixture();

            await saveVerificationConfigAction("guild_123", config);

            expect(mockVerifyGuildAccess).toHaveBeenCalledWith("guild_123");
            expect(mockSaveVerificationConfig).toHaveBeenCalledWith("guild_123", config);
            expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/verification");
        });

        it("should throw when saving fails", async () => {
            mockSaveVerificationConfig.mockRejectedValue(new Error("db down"));

            await expect(
                saveVerificationConfigAction("guild_123", verificationConfigFixture())
            ).rejects.toThrow("db down");
        });

        it("should throw a generic message when a non-error is thrown", async () => {
            mockSaveVerificationConfig.mockRejectedValue("boom");

            await expect(
                saveVerificationConfigAction("guild_123", verificationConfigFixture())
            ).rejects.toThrow("Could not save configuration.");
        });

        it("should rethrow the first zod issue message when saving rejects with a ZodError", async () => {
            mockSaveVerificationConfig.mockRejectedValue(
                new z.ZodError([
                    { code: "custom", message: "Verification config save validation failure", path: [] },
                ])
            );

            await expect(
                saveVerificationConfigAction("guild_123", verificationConfigFixture())
            ).rejects.toThrow("Verification config save validation failure");
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
            expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/verification");
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
            expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard/guild_123/verification");
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
