import { describe, it, expect } from "vitest";
import { economyConfigSchema } from "./types";

describe("economyConfigSchema", () => {
    it("should apply defaults when an empty object is parsed", () => {
        const parsed = economyConfigSchema.parse({});

        expect(parsed.enabled).toBe(false);
        expect(parsed.currencyName).toBe("coins");
        expect(parsed.workCooldownSecs).toBe(3600);
        expect(parsed.workMinReward).toBe(1000);
        expect(parsed.workMaxReward).toBe(5000);
    });

    it("should PASS a fully configured economy config", () => {
        const result = economyConfigSchema.safeParse({
            enabled: true,
            currencyName: "gems",
            workCooldownSecs: 1800,
            workMinReward: 200,
            workMaxReward: 800,
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.enabled).toBe(true);
            expect(result.data.currencyName).toBe("gems");
            expect(result.data.workCooldownSecs).toBe(1800);
            expect(result.data.workMinReward).toBe(200);
            expect(result.data.workMaxReward).toBe(800);
        }
    });

    describe("reward boundary validation", () => {
        it("should PASS when min_reward is strictly less than max_reward", () => {
            const result = economyConfigSchema.safeParse({
                workMinReward: 100,
                workMaxReward: 200,
            });
            expect(result.success).toBe(true);
        });

        it("should PASS when min_reward equals max_reward (flat payout)", () => {
            const result = economyConfigSchema.safeParse({
                workMinReward: 500,
                workMaxReward: 500,
            });
            expect(result.success).toBe(true);
        });

        it("should REJECT when min_reward is strictly greater than max_reward", () => {
            const result = economyConfigSchema.safeParse({
                workMinReward: 6000,
                workMaxReward: 5000,
            });

            expect(result.success).toBe(false);
            if (!result.success) {
                const issue = result.error.issues[0];
                expect(issue.message).toBe(
                    "Minimum work reward must be less than or equal to maximum work reward."
                );
            }
        });
    });

    describe("type & integer validation", () => {
        it("should reject non-boolean enabled value", () => {
            const result = economyConfigSchema.safeParse({ enabled: "true" });
            expect(result.success).toBe(false);
        });

        it("should reject non-integer cooldown values", () => {
            const result = economyConfigSchema.safeParse({
                workCooldownSecs: 12.5,
            });
            expect(result.success).toBe(false);
        });

        it("should reject negative reward values", () => {
            const result = economyConfigSchema.safeParse({
                workMinReward: -50,
            });
            expect(result.success).toBe(false);
        });

        it("should reject max less than min", () => {
            const result = economyConfigSchema.safeParse({
                workMinReward: 500,
                workMaxReward: 400,
            });
            expect(result.success).toBe(false);
        })
    });
});