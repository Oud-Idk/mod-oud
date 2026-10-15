import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupVerificationService, teardownVerificationService } from "./service";
import { backendFetch } from "@/lib/backend";
import { invalidateGuildChannelCache } from "@/features/_shared/channels";
import { getVerificationConfig, saveVerificationConfig } from "./queries";
import type { VerificationConfig } from "./types";
import type { MessageLayout } from "@/features/_shared/embed";

vi.mock("@/lib/backend", () => ({
    backendFetch: vi.fn<() => Promise<Response>>(),
}));

vi.mock("@/features/_shared/channels", () => ({
    invalidateGuildChannelCache: vi.fn<() => Promise<void>>(),
}));

vi.mock("./queries", () => ({
    getVerificationConfig: vi.fn<() => Promise<VerificationConfig>>(),
    saveVerificationConfig: vi.fn<() => Promise<void>>(),
}));

const mockBackendFetch = vi.mocked(backendFetch);
const mockInvalidate = vi.mocked(invalidateGuildChannelCache);
const mockGetConfig = vi.mocked(getVerificationConfig);
const mockSaveConfig = vi.mocked(saveVerificationConfig);

function configFixture(): VerificationConfig {
    return {
        enabled: false,
        useOauth: false,
        captchaType: "TURNSTILE",
        verificationMessageId: null,
        verificationChannelId: null,
        verificationRoleId: null,
        message: {
            format: "EMBED",
            content: "Please verify.",
            embed: { title: "Verify", description: "Click to verify" },
        },
    };
}

const payload: MessageLayout = {
    format: "EMBED",
    content: "",
    embed: { title: "Verify", description: "Click to verify" },
};

function jsonResponse(body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}

function errorResponse(message: string): Response {
    return new Response(message, { status: 500 });
}

describe("verification service", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
        mockGetConfig.mockResolvedValue(configFixture());
        mockInvalidate.mockResolvedValue(undefined);
        mockSaveConfig.mockResolvedValue(undefined);
    });

    async function expectExactError(promise: Promise<unknown>, message: string): Promise<void> {
        await expect(promise).rejects.toThrow(new Error(message));
    }

    describe("setupVerificationService", () => {
        it("should save enabled config with backend ids and return camelCase result", async () => {
            mockBackendFetch.mockResolvedValue(
                jsonResponse({
                    verification_message_id: "msg_1",
                    verification_channel_id: "channel_1",
                    verification_role_id: "role_1",
                })
            );

            const result = await setupVerificationService("guild_123", payload);

            expect(mockBackendFetch).toHaveBeenCalledWith(
                "/api/guilds/guild_123/verification",
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                }
            );
            expect(result).toEqual({
                verificationMessageId: "msg_1",
                verificationChannelId: "channel_1",
                verificationRoleId: "role_1",
            });
            expect(mockSaveConfig).toHaveBeenCalledWith("guild_123", {
                ...configFixture(),
                enabled: true,
                verificationMessageId: "msg_1",
                verificationChannelId: "channel_1",
                verificationRoleId: "role_1",
                message: payload,
            });
            expect(mockInvalidate).toHaveBeenCalledWith("guild_123");
        });

        it("should REJECT when the backend omits a required id", async () => {
            mockBackendFetch.mockResolvedValue(
                jsonResponse({
                    verification_message_id: "msg_1",
                    verification_channel_id: "channel_1",
                })
            );

            await expect(setupVerificationService("guild_123", payload)).rejects.toThrow();
            expect(mockSaveConfig).not.toHaveBeenCalled();
        });

        it("should throw the exact backend error text when setup is rejected", async () => {
            mockBackendFetch.mockResolvedValue(errorResponse("rate limited"));

            await expectExactError(
                setupVerificationService("guild_123", payload),
                "rate limited"
            );
            expect(mockSaveConfig).not.toHaveBeenCalled();
            expect(mockInvalidate).not.toHaveBeenCalled();
        });

        it("should throw the fallback message when setup fails with an empty body", async () => {
            mockBackendFetch.mockResolvedValue(errorResponse(""));

            await expectExactError(
                setupVerificationService("guild_123", payload),
                "The backend application rejected the verification setup request."
            );
            expect(mockSaveConfig).not.toHaveBeenCalled();
            expect(mockInvalidate).not.toHaveBeenCalled();
        });

        it("should throw the fallback message when setup fails with whitespace only", async () => {
            mockBackendFetch.mockResolvedValue(errorResponse("   \n  "));

            await expectExactError(
                setupVerificationService("guild_123", payload),
                "The backend application rejected the verification setup request."
            );
            expect(mockSaveConfig).not.toHaveBeenCalled();
        });

        it("should still save config when the channel cache reset fails on setup", async () => {
            mockBackendFetch.mockResolvedValue(
                jsonResponse({
                    verification_message_id: "msg_1",
                    verification_channel_id: "channel_1",
                    verification_role_id: "role_1",
                })
            );
            mockInvalidate.mockRejectedValueOnce(new Error("redis down"));

            const result = await setupVerificationService("guild_123", payload);

            expect(mockInvalidate).toHaveBeenCalledWith("guild_123");
            expect(mockSaveConfig).toHaveBeenCalledWith(
                "guild_123",
                expect.objectContaining({ enabled: true })
            );
            expect(result).toEqual({
                verificationMessageId: "msg_1",
                verificationChannelId: "channel_1",
                verificationRoleId: "role_1",
            });
        });
    });

    describe("teardownVerificationService", () => {
        it("should save disabled config with cleared bindings", async () => {
            mockBackendFetch.mockResolvedValue(jsonResponse({}));

            await teardownVerificationService("guild_123", {
                verification_channel_id: "channel_1",
                verification_role_id: "role_1",
            });

            expect(mockBackendFetch).toHaveBeenCalledWith(
                "/api/guilds/guild_123/verification",
                {
                    method: "DELETE",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        verification_channel_id: "channel_1",
                        verification_role_id: "role_1",
                    }),
                }
            );
            expect(mockInvalidate).toHaveBeenCalledWith("guild_123");
            expect(mockSaveConfig).toHaveBeenCalledWith("guild_123", {
                ...configFixture(),
                enabled: false,
                verificationMessageId: null,
                verificationChannelId: null,
                verificationRoleId: null,
            });
        });

        it("should throw the exact backend error text when teardown is rejected", async () => {
            mockBackendFetch.mockResolvedValue(errorResponse("nothing to delete"));

            await expectExactError(
                teardownVerificationService("guild_123", {
                    verification_channel_id: "channel_1",
                    verification_role_id: "role_1",
                }),
                "nothing to delete"
            );
            expect(mockSaveConfig).not.toHaveBeenCalled();
            expect(mockInvalidate).not.toHaveBeenCalled();
        });

        it("should throw the fallback message when teardown fails with an empty body", async () => {
            mockBackendFetch.mockResolvedValue(errorResponse(""));

            await expectExactError(
                teardownVerificationService("guild_123", {
                    verification_channel_id: "channel_1",
                    verification_role_id: "role_1",
                }),
                "The backend application rejected the verification removal request."
            );
            expect(mockSaveConfig).not.toHaveBeenCalled();
        });

        it("should throw the fallback message when teardown fails with whitespace only", async () => {
            mockBackendFetch.mockResolvedValue(errorResponse("  "));

            await expectExactError(
                teardownVerificationService("guild_123", {
                    verification_channel_id: "channel_1",
                    verification_role_id: "role_1",
                }),
                "The backend application rejected the verification removal request."
            );
            expect(mockSaveConfig).not.toHaveBeenCalled();
        });

        it("should still save config when the channel cache reset fails on teardown", async () => {
            mockBackendFetch.mockResolvedValue(jsonResponse({}));
            mockInvalidate.mockRejectedValueOnce(new Error("redis down"));

            await teardownVerificationService("guild_123", {
                verification_channel_id: "channel_1",
                verification_role_id: "role_1",
            });

            expect(mockInvalidate).toHaveBeenCalledWith("guild_123");
            expect(mockSaveConfig).toHaveBeenCalledWith(
                "guild_123",
                expect.objectContaining({ enabled: false })
            );
        });
    });
});
