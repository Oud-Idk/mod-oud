import { describe, it, expect } from "vitest";
import {
    publicWelcomeConfigSchema,
    privateWelcomeConfigSchema,
    welcomeConfigSchema,
    saveWelcomeConfigSchema,
    welcomeImageStyleSchema,
} from "./types";

describe("publicWelcomeConfigSchema", () => {
    it("should apply defaults when parsing an empty object", () => {
        const parsed = publicWelcomeConfigSchema.parse({});

        expect(parsed.enabled).toBe(false);
        expect(parsed.channel_id).toBeNull();
        expect(parsed.sendImage).toBe(false);
        expect(parsed.message.format).toBe("EMBED");
        expect(parsed.message.content).toBe("");
        expect(parsed.message.embed).toEqual({});
    });

    it("should keep provided values", () => {
        const parsed = publicWelcomeConfigSchema.parse({
            enabled: true,
            channel_id: "channel_1",
            sendImage: true,
            message: {
                format: "TEXT",
                content: "Welcome!",
            },
        });

        expect(parsed.enabled).toBe(true);
        expect(parsed.channel_id).toBe("channel_1");
        expect(parsed.sendImage).toBe(true);
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

    it("should ACCEPT an empty message in draft mode (base schema is lax)", () => {
        const result = privateWelcomeConfigSchema.safeParse({
            enabled: true,
            message: { format: "TEXT", content: "" },
        });

        expect(result.success).toBe(true);
    });
});

describe("welcomeConfigSchema", () => {
    it("should apply exact defaults when parsing an empty object", () => {
        const parsed = welcomeConfigSchema.parse({});

        expect(parsed.public).toEqual({
            enabled: false,
            channel_id: null,
            sendImage: false,
            imageStyle: {
                backgroundColor: "#2B2D31",
                accentColor: "#5865F2",
                avatarRingColor: "#5865F2",
                headingColor: "#FFFFFF",
                usernameColor: "#5865F2",
                memberTextColor: "#B5BAC1",
            },
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

describe("welcomeImageStyleSchema", () => {
    it("should apply defaults when parsing an empty object", () => {
        const parsed = welcomeImageStyleSchema.parse({});

        expect(parsed.backgroundColor).toBe("#2B2D31");
        expect(parsed.accentColor).toBe("#5865F2");
        expect(parsed.avatarRingColor).toBe("#5865F2");
        expect(parsed.headingColor).toBe("#FFFFFF");
        expect(parsed.usernameColor).toBe("#5865F2");
        expect(parsed.memberTextColor).toBe("#B5BAC1");
    });

    it("should keep provided colors", () => {
        const parsed = welcomeImageStyleSchema.parse({
            backgroundColor: "#111111",
            usernameColor: "#FF0000",
        });

        expect(parsed.backgroundColor).toBe("#111111");
        expect(parsed.usernameColor).toBe("#FF0000");
        expect(parsed.accentColor).toBe("#5865F2");
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
            public: {
                enabled: true,
                channel_id: "channel_1",
                message: { format: "TEXT", content: "Welcome!" },
            },
        });

        expect(result.success).toBe(true);
    });

    it("should accept public welcome messages that are disabled", () => {
        const result = saveWelcomeConfigSchema.safeParse({
            public: { enabled: false, channel_id: null },
        });

        expect(result.success).toBe(true);
    });

    it("should NOT let a disabled section with an empty message block saving", () => {
        const result = saveWelcomeConfigSchema.safeParse({
            public: {
                enabled: true,
                channel_id: "channel_1",
                message: { format: "TEXT", content: "Welcome!" },
            },
            private: {
                enabled: false,
                message: { format: "TEXT", content: "", embed: {} },
            },
            joinRoleIds: [],
        });

        expect(result.success).toBe(true);
    });

    it("should REJECT an enabled TEXT message with empty content", () => {
        const result = saveWelcomeConfigSchema.safeParse({
            public: {
                enabled: true,
                channel_id: "channel_1",
                message: { format: "TEXT", content: "   " },
            },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual({
                code: 'custom',
                message: "Message content cannot be empty when format is set to TEXT!",
                path: ["public", "message", "content"],
            });
        }
    });

    it("should REJECT an enabled EMBED message with an empty embed", () => {
        const result = saveWelcomeConfigSchema.safeParse({
            public: {
                enabled: true,
                channel_id: "channel_1",
                message: { format: "EMBED", content: "", embed: {} },
            },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual({
                code: 'custom',
                message: "Embed must have a title, description, or fields when format is set to EMBED!",
                path: ["public", "message", "embed"],
            });
        }
    });

    it("should REJECT an enabled private message with empty content", () => {
        const result = saveWelcomeConfigSchema.safeParse({
            private: {
                enabled: true,
                message: { format: "TEXT", content: "" },
            },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual({
                code: 'custom',
                message: "Message content cannot be empty when format is set to TEXT!",
                path: ["private", "message", "content"],
            });
        }
    });
});
