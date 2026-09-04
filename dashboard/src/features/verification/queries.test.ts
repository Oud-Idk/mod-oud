import { describe, it, expect, vi, beforeEach } from "vitest";
import { getVerificationConfig, saveVerificationConfig } from "./queries";
import {
    getGuildConfigField,
    replaceGuildConfigField,
    saveGuildConfigField,
} from "@/features/_shared/guild";
import type { VerificationConfig } from "./types";

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn<() => Promise<unknown>>(),
    saveGuildConfigField: vi.fn<() => Promise<void>>(),
    replaceGuildConfigField: vi.fn<() => Promise<void>>(),
}));

const mockGetGuildConfigField = vi.mocked(getGuildConfigField);
const mockSaveGuildConfigField = vi.mocked(saveGuildConfigField);
const mockReplaceGuildConfigField = vi.mocked(replaceGuildConfigField);

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

describe("Verification Query Module", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe("getVerificationConfig", () => {
        it("should prefer the top-level key when present", async () => {
            const config = { ...verificationConfigFixture(), enabled: true };
            mockGetGuildConfigField.mockResolvedValueOnce(config);

            const result = await getVerificationConfig("guild_123");

            expect(mockGetGuildConfigField).toHaveBeenCalledWith("guild_123", "verification");
            expect(result.enabled).toBe(true);
        });

        it("should fall back to the legacy welcome nesting when the top-level key is missing", async () => {
            mockGetGuildConfigField.mockResolvedValueOnce(null);
            mockGetGuildConfigField.mockResolvedValueOnce({
                public: { enabled: false },
                verification: { ...verificationConfigFixture(), enabled: true },
            });

            const result = await getVerificationConfig("guild_123");

            expect(mockGetGuildConfigField).toHaveBeenCalledWith("guild_123", "welcome");
            expect(result.enabled).toBe(true);
        });

        it("should return default config when DB returns nothing", async () => {
            mockGetGuildConfigField.mockResolvedValue(null);

            const result = await getVerificationConfig("guild_123");

            expect(result.enabled).toBe(false);
            expect(result.captchaType).toBe("TURNSTILE");
            expect(result.verificationChannelId).toBeNull();
        });

        it("should propagate a database error", async () => {
            mockGetGuildConfigField.mockRejectedValue(new Error("connection lost"));

            await expect(getVerificationConfig("guild_123")).rejects.toThrow("connection lost");
        });
    });

    describe("saveVerificationConfig", () => {
        it("should save to the top-level key", async () => {
            const config = verificationConfigFixture();
            mockGetGuildConfigField.mockResolvedValue({ public: { enabled: false } });

            await saveVerificationConfig("guild_123", config);

            expect(mockSaveGuildConfigField).toHaveBeenCalledWith(
                "guild_123",
                "verification",
                config
            );
        });

        it("should remove the legacy nested copy when present", async () => {
            const config = verificationConfigFixture();
            mockGetGuildConfigField.mockResolvedValue({
                public: { enabled: false },
                verification: { enabled: true },
            });

            await saveVerificationConfig("guild_123", config);

            expect(mockReplaceGuildConfigField).toHaveBeenCalledWith(
                "guild_123",
                "welcome",
                { public: { enabled: false } }
            );
        });

        it("should skip the cleanup when no legacy copy exists", async () => {
            const config = verificationConfigFixture();
            mockGetGuildConfigField.mockResolvedValue({ public: { enabled: false } });

            await saveVerificationConfig("guild_123", config);

            expect(mockReplaceGuildConfigField).not.toHaveBeenCalled();
        });
    });
});
