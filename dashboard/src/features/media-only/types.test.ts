import { describe, it, expect } from "vitest";
import { mediaOnlyChannelSchema } from "./types";

describe("mediaOnlyChannelSchema", () => {
    it("should apply defaults when parsing a partial config", () => {
        const parsed = mediaOnlyChannelSchema.parse({ channelId: "chan_1" });

        expect(parsed.enabled).toBe(true);
        expect(parsed.allowImages).toBe(true);
        expect(parsed.allowVideos).toBe(true);
        expect(parsed.allowAudio).toBe(false);
        expect(parsed.allowGif).toBe(true);
        expect(parsed.allowLinks).toBe(true);
        expect(parsed.allowEmbeddedText).toBe(true);
        expect(parsed.autoThread).toBe(false);
        expect(parsed.threadNameTemplate).toBe("Discussion - {user}");
        expect(parsed.deleteWarningAfterSecs).toBe(5);
        expect(parsed.exemptRoles).toEqual([]);
    });

    it("should PASS a fully configured channel", () => {
        const result = mediaOnlyChannelSchema.safeParse({
            channelId: "chan_1",
            enabled: true,
            allowImages: true,
            allowVideos: false,
            allowAudio: true,
            allowGif: false,
            allowLinks: true,
            allowEmbeddedText: false,
            autoThread: true,
            threadNameTemplate: "Talk about it",
            deleteWarningAfterSecs: 10,
            exemptRoles: ["role_1", "role_2"],
        });

        expect(result.success).toBe(true);
    });

    it("should accept an honest null threadNameTemplate", () => {
        const parsed = mediaOnlyChannelSchema.parse({
            channelId: "chan_1",
            threadNameTemplate: null,
        });

        expect(parsed.threadNameTemplate).toBeNull();
    });

    it("should REJECT a missing channelId", () => {
        const result = mediaOnlyChannelSchema.safeParse({});

        expect(result.success).toBe(false);
    });

    it("should REJECT a negative deleteWarningAfterSecs", () => {
        const result = mediaOnlyChannelSchema.safeParse({
            channelId: "chan_1",
            deleteWarningAfterSecs: -1,
        });

        expect(result.success).toBe(false);
    });

    it("should REJECT a deleteWarningAfterSecs above 120", () => {
        const result = mediaOnlyChannelSchema.safeParse({
            channelId: "chan_1",
            deleteWarningAfterSecs: 121,
        });

        expect(result.success).toBe(false);
    });

    it("should accept non-integer exemptRoles entries as strings", () => {
        const parsed = mediaOnlyChannelSchema.parse({
            channelId: "chan_1",
            exemptRoles: ["role_1"],
        });

        expect(parsed.exemptRoles).toEqual(["role_1"]);
    });
});
