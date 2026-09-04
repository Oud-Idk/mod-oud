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

        it("should throw the backend error text when setup is rejected", async () => {
            mockBackendFetch.mockResolvedValue(errorResponse("rate limited"));

            await expect(setupVerificationService("guild_123", payload)).rejects.toThrow(
                "rate limited"
            );
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
                expect.objectContaining({ method: "DELETE" })
            );
            expect(mockSaveConfig).toHaveBeenCalledWith("guild_123", {
                ...configFixture(),
                enabled: false,
                verificationMessageId: null,
                verificationChannelId: null,
                verificationRoleId: null,
            });
        });

        it("should throw the backend error text when teardown is rejected", async () => {
            mockBackendFetch.mockResolvedValue(errorResponse("nothing to delete"));

            await expect(
                teardownVerificationService("guild_123", {
                    verification_channel_id: "channel_1",
                    verification_role_id: "role_1",
                })
            ).rejects.toThrow("nothing to delete");
        });
    });
});
