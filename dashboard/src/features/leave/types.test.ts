import { describe, it, expect } from "vitest";
import { saveLeaveConfigSchema } from "./types";

describe("saveLeaveConfigSchema", () => {
    // A disabled config skips every check, so this fails if the enabled guard is removed.
    it("should accept a disabled config without a channel or message", () => {
        const result = saveLeaveConfigSchema.safeParse({
            enabled: false,
            channelId: null,
        });

        expect(result.success).toBe(true);
    });

    it("should accept a disabled config with an empty message", () => {
        const result = saveLeaveConfigSchema.safeParse({
            enabled: false,
            channelId: null,
            message: { format: "TEXT", content: "" },
        });

        expect(result.success).toBe(true);
    });

    // Exact issue match; the code and path pin the channel addIssue call.
    it("should REJECT an enabled config without a channel", () => {
        const result = saveLeaveConfigSchema.safeParse({
            enabled: true,
            channelId: null,
            message: { format: "TEXT", content: "Sad to see you go!" },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual({
                code: 'custom',
                message: "Please select a channel for leave messages.",
                path: ["channelId"],
            });
        }
    });

    it("should REJECT an enabled config with a blank channel", () => {
        const result = saveLeaveConfigSchema.safeParse({
            enabled: true,
            channelId: "   ",
            message: { format: "TEXT", content: "Sad to see you go!" },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual({
                code: 'custom',
                message: "Please select a channel for leave messages.",
                path: ["channelId"],
            });
        }
    });

    it("should accept an enabled config with a channel and message", () => {
        const result = saveLeaveConfigSchema.safeParse({
            enabled: true,
            channelId: "channel_1",
            message: { format: "TEXT", content: "Sad to see you go!" },
        });

        expect(result.success).toBe(true);
    });

    // Exact path match; the empty prefix pins the pathPrefix argument.
    it("should REJECT an enabled TEXT message with empty content", () => {
        const result = saveLeaveConfigSchema.safeParse({
            enabled: true,
            channelId: "channel_1",
            message: { format: "TEXT", content: "   " },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual({
                code: 'custom',
                message: "Message content cannot be empty when format is set to TEXT!",
                path: ["message", "content"],
            });
        }
    });

    it("should REJECT an enabled EMBED message with an empty embed", () => {
        const result = saveLeaveConfigSchema.safeParse({
            enabled: true,
            channelId: "channel_1",
            message: { format: "EMBED", content: "", embed: {} },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues).toContainEqual({
                code: 'custom',
                message: "Embed must have a title, description, or fields when format is set to EMBED!",
                path: ["message", "embed"],
            });
        }
    });
});
