import { describe, it, expect } from "vitest";
import {
    publicWelcomeConfigSchema,
    privateWelcomeConfigSchema,
    welcomeConfigSchema,
    saveWelcomeConfigSchema,
} from "./types";

describe("publicWelcomeConfigSchema", () => {
    it("should apply defaults when parsing an empty object", () => {
        const parsed = publicWelcomeConfigSchema.parse({});

        expect(parsed.enabled).toBe(false);
        expect(parsed.channel_id).toBeNull();
        expect(parsed.message.format).toBe("EMBED");
        expect(parsed.message.content).toBe("");
        expect(parsed.message.embed).toEqual({});
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

describe("welcomeConfigSchema", () => {
    it("should apply exact defaults when parsing an empty object", () => {
        const parsed = welcomeConfigSchema.parse({});

        expect(parsed.public).toEqual({
            enabled: false,
            channel_id: null,
            message: {
                format: "EMBED",
                content: "",
                embed: {},
            },
        });
        expect(parsed.private).toEqual({
            enabled: false,
            message: {
                enabled: false,
                format: "TEXT",
                content: "",
                embed: {},
            },
        });
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
    // Kills .trim() whitespace mutants and path: ["public", "channel_id"] mutant
    it("should REJECT public welcome messages without a channel or with whitespace", () => {
        const resultNull = saveWelcomeConfigSchema.safeParse({
            public: { enabled: true, channel_id: null },
        });

        expect(resultNull.success).toBe(false);
        if (!resultNull.success) {
            expect(resultNull.error.issues).toContainEqual({
                code: 'custom',
                message: "Please select a channel for public welcome messages.",
                path: ["public", "channel_id"],
            });
        }

        const resultSpace = saveWelcomeConfigSchema.safeParse({
            public: { enabled: true, channel_id: "   " },
        });
        expect(resultSpace.success).toBe(false);
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
