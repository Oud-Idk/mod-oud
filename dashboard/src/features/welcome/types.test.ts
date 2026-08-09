import { describe, it, expect } from "vitest";
import {
    publicWelcomeConfigSchema,
    privateWelcomeConfigSchema,
    verificationConfigSchema,
    welcomeConfigSchema,
    saveWelcomeConfigSchema,
    setupVerificationPayloadSchema,
    setupBackendResponseSchema,
    teardownVerificationPayloadSchema,
} from "./types";

describe("publicWelcomeConfigSchema", () => {
    it("should apply defaults when parsing an empty object", () => {
        const parsed = publicWelcomeConfigSchema.parse({});

        expect(parsed.enabled).toBe(false);
        expect(parsed.channel_id).toBeNull();
        expect(parsed.message.format).toBe("EMBED");
        expect(parsed.message.content).toBe("");
    });

    it("should keep provided values", () => {
        const parsed = publicWelcomeConfigSchema.parse({
            enabled: true,
            channel_id: "channel_1",
            message: {
                format: "TEXT",
                content: "Welcome!",
            },
        });

        expect(parsed.enabled).toBe(true);
        expect(parsed.channel_id).toBe("channel_1");
        expect(parsed.message.format).toBe("TEXT");
        expect(parsed.message.content).toBe("Welcome!");
    });
});

describe("privateWelcomeConfigSchema", () => {
    it("should apply defaults when parsing undefined", () => {
        const parsed = privateWelcomeConfigSchema.parse(undefined);

        expect(parsed.enabled).toBe(false);
        expect(parsed.message.format).toBe("TEXT");
        expect(parsed.message.content).toBe("");
    });

    it("should REJECT a private message with TEXT format and empty content", () => {
        const result = privateWelcomeConfigSchema.safeParse({
            enabled: true,
            message: { format: "TEXT", content: "" },
        });

        expect(result.success).toBe(false);
    });
});

describe("verificationConfigSchema", () => {
    it("should apply defaults when parsing an empty object", () => {
        const parsed = verificationConfigSchema.parse({});

        expect(parsed.enabled).toBe(false);
        expect(parsed.useOauth).toBe(false);
        expect(parsed.captchaType).toBe("TURNSTILE");
        expect(parsed.verificationMessageId).toBeNull();
        expect(parsed.verificationChannelId).toBeNull();
        expect(parsed.verificationRoleId).toBeNull();
        expect(parsed.message.format).toBe("EMBED");
    });

    it("should REJECT an invalid captcha type", () => {
        expect(
            verificationConfigSchema.safeParse({ captchaType: "RECAPTCHA" }).success
        ).toBe(false);
    });
});

describe("welcomeConfigSchema", () => {
    it("should apply defaults when parsing an empty object", () => {
        const parsed = welcomeConfigSchema.parse({});

        expect(parsed.public.enabled).toBe(false);
        expect(parsed.private.enabled).toBe(false);
        expect(parsed.verification.enabled).toBe(false);
        expect(parsed.joinRoleIds).toEqual([]);
    });

    it("should keep provided join role ids", () => {
        const parsed = welcomeConfigSchema.parse({
            joinRoleIds: ["role_1", "role_2"],
        });

        expect(parsed.joinRoleIds).toEqual(["role_1", "role_2"]);
    });
});

describe("saveWelcomeConfigSchema", () => {
    it("should REJECT public welcome messages without a channel", () => {
        const result = saveWelcomeConfigSchema.safeParse({
            public: { enabled: true, channel_id: null },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues.some((i) => i.path[0] === "public")).toBe(true);
        }
    });

    it("should accept public welcome messages with a channel", () => {
        const result = saveWelcomeConfigSchema.safeParse({
            public: { enabled: true, channel_id: "channel_1" },
        });

        expect(result.success).toBe(true);
    });

    it("should accept public welcome messages that are disabled", () => {
        const result = saveWelcomeConfigSchema.safeParse({
            public: { enabled: false, channel_id: null },
        });

        expect(result.success).toBe(true);
    });
});

describe("setupVerificationPayloadSchema", () => {
    it("should accept a valid embed message", () => {
        const result = setupVerificationPayloadSchema.safeParse({
            message: {
                format: "EMBED",
                content: "",
                embed: { title: "Verify", description: "Click to verify" },
            },
        });

        expect(result.success).toBe(true);
    });

    it("should REJECT an empty embed message", () => {
        const result = setupVerificationPayloadSchema.safeParse({
            message: {
                format: "EMBED",
                content: "",
                embed: {},
            },
        });

        expect(result.success).toBe(false);
    });
});

describe("setupBackendResponseSchema", () => {
    it("should parse all three ids", () => {
        const parsed = setupBackendResponseSchema.parse({
            verification_message_id: "msg_1",
            verification_channel_id: "channel_1",
            verification_role_id: "role_1",
        });

        expect(parsed.verification_message_id).toBe("msg_1");
        expect(parsed.verification_channel_id).toBe("channel_1");
        expect(parsed.verification_role_id).toBe("role_1");
    });

    it("should REJECT when a required id is missing", () => {
        expect(
            setupBackendResponseSchema.safeParse({
                verification_message_id: "msg_1",
                verification_channel_id: "channel_1",
            }).success
        ).toBe(false);
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

    it("should REJECT a missing role id", () => {
        const result = teardownVerificationPayloadSchema.safeParse({
            verification_channel_id: "channel_1",
            verification_role_id: "",
        });

        expect(result.success).toBe(false);
    });
});
