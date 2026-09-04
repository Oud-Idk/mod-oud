import { describe, it, expect } from "vitest";
import {
    verificationConfigSchema,
    saveVerificationConfigSchema,
    teardownVerificationPayloadSchema,
} from "./types";

describe("verificationConfigSchema", () => {
    // Kills defaultVerificationEmbed & verificationConfigSchema default mutants
    it("should apply exact defaults when parsing an empty object", () => {
        const parsed = verificationConfigSchema.parse({});

        expect(parsed.enabled).toBe(false);
        expect(parsed.useOauth).toBe(false);
        expect(parsed.captchaType).toBe("TURNSTILE");
        expect(parsed.verificationMessageId).toBeNull();
        expect(parsed.verificationChannelId).toBeNull();
        expect(parsed.verificationRoleId).toBeNull();
        expect(parsed.message).toEqual({
            format: "EMBED",
            content: "Please complete the verification below to gain access to the server.",
            embed: {
                title: "Server Verification Required",
                description:
                    "Click the verification button below to verify your account and gain full access.",
                color: 0x55ee77,
            },
        });
    });

    // Kills HCAPTCHA enum mutant
    it("should accept HCAPTCHA as a valid captcha type", () => {
        const parsed = verificationConfigSchema.parse({ captchaType: "HCAPTCHA" });
        expect(parsed.captchaType).toBe("HCAPTCHA");
    });

    it("should REJECT an invalid captcha type", () => {
        expect(
            verificationConfigSchema.safeParse({ captchaType: "RECAPTCHA" }).success
        ).toBe(false);
    });
});

describe("saveVerificationConfigSchema", () => {
    it("should accept a disabled config without bindings", () => {
        const result = saveVerificationConfigSchema.safeParse({
            enabled: false,
            verificationChannelId: null,
            verificationRoleId: null,
            verificationMessageId: null,
        });

        expect(result.success).toBe(true);
    });

    it("should keep provided bindings", () => {
        const parsed = saveVerificationConfigSchema.parse({
            enabled: true,
            verificationChannelId: "channel_1",
            verificationRoleId: "role_1",
            verificationMessageId: "msg_1",
        });

        expect(parsed.verificationChannelId).toBe("channel_1");
        expect(parsed.verificationRoleId).toBe("role_1");
        expect(parsed.verificationMessageId).toBe("msg_1");
    });

    // The setup flow requires saving `enabled: true` before bindings exist
    // (Setup tab only appears once enabled; setup fills in the ids).
    it("should accept an enabled config without bindings (pre-setup state)", () => {
        const result = saveVerificationConfigSchema.safeParse({
            enabled: true,
            verificationChannelId: null,
            verificationRoleId: null,
            verificationMessageId: null,
        });

        expect(result.success).toBe(true);
    });
});

describe("teardownVerificationPayloadSchema", () => {
    it("should accept valid ids", () => {
        const result = teardownVerificationPayloadSchema.safeParse({
            verification_channel_id: "channel_1",
            verification_role_id: "role_1",
        });

        expect(result.success).toBe(true);
    });

    it("should REJECT a missing channel id", () => {
        const result = teardownVerificationPayloadSchema.safeParse({
            verification_channel_id: "",
            verification_role_id: "role_1",
        });

        expect(result.success).toBe(false);
    });

    // Kills verification_role_id error message mutant
    it("should REJECT a missing role id with exact error message", () => {
        const result = teardownVerificationPayloadSchema.safeParse({
            verification_channel_id: "channel_1",
            verification_role_id: "",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Verification Role ID is required");
        }
    });
});
