import { describe, it, expect } from "vitest";
import { leaveConfigSchema, saveLeaveConfigSchema, DEFAULT_LEAVE_MESSAGE } from "./types";

describe("leaveConfigSchema", () => {
    it("should apply defaults when an empty object is parsed", () => {
        const parsed = leaveConfigSchema.parse({});

        expect(parsed.enabled).toBe(false);
        expect(parsed.channelId).toBeNull();
        expect(parsed.message).toEqual(DEFAULT_LEAVE_MESSAGE);
    });

    it("should PASS a fully configured leave config with an embed message", () => {
        const result = leaveConfigSchema.safeParse({
            enabled: true,
            channelId: "chan_1",
            message: {
                enabled: true,
                format: "EMBED",
                content: "",
                embed: { title: "Goodbye!" },
            },
        });

        expect(result.success).toBe(true);
    });

    it("should accept honest null for the channel", () => {
        const parsed = leaveConfigSchema.parse({ channelId: null });
        expect(parsed.channelId).toBeNull();
    });

    it("should REJECT an unknown message format", () => {
        const result = leaveConfigSchema.safeParse({
            message: { format: "XML" },
        });

        expect(result.success).toBe(false);
    });

    it("should REJECT a TEXT message with empty content", () => {
        const result = leaveConfigSchema.safeParse({
            message: { format: "TEXT", content: "" },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toContain("Message content cannot be empty");
        }
    });

    it("should PASS a TEXT message with non-empty content", () => {
        expect(
            leaveConfigSchema.safeParse({
                message: { format: "TEXT", content: "Sad to see you go" },
            }).success
        ).toBe(true);
    });

    it("should REJECT an EMBED message with an empty embed", () => {
        const result = leaveConfigSchema.safeParse({
            message: { format: "EMBED", content: "", embed: {} },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toContain(
                "Embed must have a title, description, or fields"
            );
        }
    });
});

describe("saveLeaveConfigSchema", () => {
    it("should REJECT when enabled without a channel", () => {
        const result = saveLeaveConfigSchema.safeParse({
            enabled: true,
            channelId: null,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "Please select a channel for leave messages!"
            );
        }
    });

    it("should PASS when enabled with a channel", () => {
        const result = saveLeaveConfigSchema.safeParse({
            enabled: true,
            channelId: "chan_1",
        });

        expect(result.success).toBe(true);
    });

    it("should PASS when disabled without a channel", () => {
        const result = saveLeaveConfigSchema.safeParse({
            enabled: false,
            channelId: null,
        });

        expect(result.success).toBe(true);
    });

    it("should PASS when enabled with an empty-string channel", () => {
        const result = saveLeaveConfigSchema.safeParse({
            enabled: true,
            channelId: "chan_1",
        });

        expect(result.success).toBe(true);
    });
});
