import { describe, it, expect } from "vitest";
import {
    SLOWMODE_LADDER,
    dynamicSlowmodeConfigSchema,
    saveDynamicSlowmodeConfigSchema,
} from "./types";

const DEFAULTS = {
    enabled: false,
    channels: [],
    ceilingSecs: 300,
    authorThresholds: [4, 6, 9, 13, 18, 24, 30, 40],
    volumeThresholds: [16, 26, 38, 56, 78, 104, 130, 170],
    windowSecs: 60,
};

describe("dynamicSlowmodeConfigSchema", () => {
    it("should apply defaults when an empty object is parsed", () => {
        expect(dynamicSlowmodeConfigSchema.parse({})).toEqual(DEFAULTS);
    });

    it("should keep a saved config intact", () => {
        const saved = {
            ...DEFAULTS,
            enabled: true,
            channels: ["chan_1", "chan_2"],
            ceilingSecs: 120,
        };

        expect(dynamicSlowmodeConfigSchema.parse(saved)).toEqual(saved);
    });

    it("should reject a threshold list that does not match the ladder", () => {
        const result = dynamicSlowmodeConfigSchema.safeParse({
            authorThresholds: [4, 6, 9],
        });

        expect(result.success).toBe(false);
    });

    it("should reject a window shorter than ten seconds", () => {
        expect(dynamicSlowmodeConfigSchema.safeParse({ windowSecs: 9 }).success).toBe(false);
        expect(dynamicSlowmodeConfigSchema.safeParse({ windowSecs: 10 }).success).toBe(true);
    });

    it("should reject a ceiling above Discord's maximum", () => {
        expect(dynamicSlowmodeConfigSchema.safeParse({ ceilingSecs: 21_601 }).success).toBe(false);
        expect(dynamicSlowmodeConfigSchema.safeParse({ ceilingSecs: 21_600 }).success).toBe(true);
    });
});

describe("saveDynamicSlowmodeConfigSchema", () => {
    it("should allow enabling with at least one channel", () => {
        const result = saveDynamicSlowmodeConfigSchema.safeParse({
            ...DEFAULTS,
            enabled: true,
            channels: ["chan_1"],
        });

        expect(result.success).toBe(true);
    });

    it("should refuse to enable with no channels", () => {
        const result = saveDynamicSlowmodeConfigSchema.safeParse({
            ...DEFAULTS,
            enabled: true,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            // Code and path attribute the issue to the channels field.
            expect(result.error.issues[0].code).toBe("custom");
            expect(result.error.issues[0].path).toEqual(["channels"]);
            expect(result.error.issues[0].message).toBe(
                "Add at least one channel before enabling dynamic slowmode."
            );
        }
    });

    it("should allow a disabled config with no channels", () => {
        expect(saveDynamicSlowmodeConfigSchema.safeParse(DEFAULTS).success).toBe(true);
    });

    it("should refuse a ceiling that is not a ladder rung", () => {
        const result = saveDynamicSlowmodeConfigSchema.safeParse({
            ...DEFAULTS,
            ceilingSecs: 45,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].code).toBe("custom");
            expect(result.error.issues[0].path).toEqual(["ceilingSecs"]);
            expect(result.error.issues[0].message).toBe(
                "The ceiling must be one of the ladder values."
            );
        }
    });

    it("should accept every ladder rung above zero as a ceiling", () => {
        for (const rung of SLOWMODE_LADDER) {
            const result = saveDynamicSlowmodeConfigSchema.safeParse({
                ...DEFAULTS,
                ceilingSecs: rung,
            });

            expect(result.success).toBe(rung > 0);
        }
    });
});
