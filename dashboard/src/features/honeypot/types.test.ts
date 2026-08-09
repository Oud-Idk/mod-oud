import { describe, it, expect } from "vitest";
import { honeypotConfigSchema } from "./types";

describe("honeypotConfigSchema", () => {
    it("should apply defaults when an empty object is parsed", () => {
        const parsed = honeypotConfigSchema.parse({});

        expect(parsed.enabled).toBe(false);
        expect(parsed.channelId).toBeNull();
        expect(parsed.exemptRoles).toEqual([]);
        expect(parsed.dmd).toBe(3);
        expect(parsed.reason).toBe("Sending a message in a honeypot channel");
        expect(parsed.duration).toBeNull();
    });

    it("should PASS a fully configured honeypot config", () => {
        const result = honeypotConfigSchema.safeParse({
            enabled: true,
            channelId: "chan_1",
            exemptRoles: ["role_1", "role_2"],
            dmd: 7,
            reason: "Do not type here",
            duration: 3600,
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.channelId).toBe("chan_1");
            expect(result.data.dmd).toBe(7);
            expect(result.data.duration).toBe(3600);
        }
    });

    it("should accept honest null values for optional fields", () => {
        const parsed = honeypotConfigSchema.parse({
            channelId: null,
            reason: null,
            duration: null,
        });

        expect(parsed.channelId).toBeNull();
        expect(parsed.reason).toBeNull();
        expect(parsed.duration).toBeNull();
    });

    describe("dmd validation", () => {
        it("should accept the lower bound of 0", () => {
            expect(honeypotConfigSchema.safeParse({ dmd: 0 }).success).toBe(true);
        });

        it("should accept the upper bound of 7", () => {
            expect(honeypotConfigSchema.safeParse({ dmd: 7 }).success).toBe(true);
        });

        it("should REJECT a dmd below 0", () => {
            const result = honeypotConfigSchema.safeParse({ dmd: -1 });
            expect(result.success).toBe(false);
        });

        it("should REJECT a dmd above 7", () => {
            const result = honeypotConfigSchema.safeParse({ dmd: 8 });
            expect(result.success).toBe(false);
        });
    });

    it("should coerce a numeric string channelId to a string", () => {
        const parsed = honeypotConfigSchema.parse({ channelId: "123456789" });
        expect(parsed.channelId).toBe("123456789");
    });

    it("should reject a non-boolean enabled value", () => {
        const result = honeypotConfigSchema.safeParse({ enabled: "yes" });
        expect(result.success).toBe(false);
    });
});
