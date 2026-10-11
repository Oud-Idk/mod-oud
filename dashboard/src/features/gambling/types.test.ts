import { describe, it, expect } from "vitest";
import { gamblingConfigSchema } from "./types";

describe("gamblingConfigSchema", () => {
    it("should apply defaults when an empty object is parsed", () => {
        const parsed = gamblingConfigSchema.parse({});

        expect(parsed).toEqual({
            enabled: false,
            cooldownSecs: 0,
            minBet: 10,
            maxBet: 0,
            timeoutSecs: 60,
            blackjack: { enabled: true },
            coinflip: { enabled: true },
            slots: { enabled: true },
            roulette: { enabled: true },
            higherlower: { enabled: true },
        });
    });

    it("should PASS a fully configured gambling config", () => {
        const config = {
            enabled: true,
            cooldownSecs: 30,
            minBet: 100,
            maxBet: 5000,
            timeoutSecs: 120,
            blackjack: { enabled: false },
            coinflip: { enabled: true },
            slots: { enabled: true },
            roulette: { enabled: true },
            higherlower: { enabled: false },
        };

        const result = gamblingConfigSchema.safeParse(config);

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual(config);
        }
    });

    it("should strip unknown keys from the parsed config", () => {
        const parsed = gamblingConfigSchema.parse({ legacy_field: "nope", minBet: 25 });

        expect(parsed).not.toHaveProperty("legacy_field");
        expect(parsed.minBet).toBe(25);
    });

    describe("bet range validation", () => {
        it("should PASS when maxBet is 0, which means no cap", () => {
            const result = gamblingConfigSchema.safeParse({ minBet: 500, maxBet: 0 });

            expect(result.success).toBe(true);
        });

        it("should PASS when maxBet equals minBet, a flat wager", () => {
            const result = gamblingConfigSchema.safeParse({ minBet: 250, maxBet: 250 });

            expect(result.success).toBe(true);
        });

        it("should PASS when maxBet is strictly greater than minBet", () => {
            const result = gamblingConfigSchema.safeParse({ minBet: 100, maxBet: 200 });

            expect(result.success).toBe(true);
        });

        it("should REJECT when a non-zero maxBet is below minBet", () => {
            const result = gamblingConfigSchema.safeParse({ minBet: 100, maxBet: 50 });

            expect(result.success).toBe(false);
            if (!result.success) {
                const issue = result.error.issues[0];
                expect(issue.message).toBe(
                    "Maximum bet must be 0 (no cap) or >= minimum bet."
                );
                expect(issue.path).toEqual(["maxBet"]);
            }
        });

        it("should anchor the refinement issue on maxBet even when min is the offending field", () => {
            const result = gamblingConfigSchema.safeParse({ minBet: 900, maxBet: 100 });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].path).toEqual(["maxBet"]);
            }
        });

        // A negative maxBet trips both the nonnegative check and the refinement,
        // since -1 is neither the no-cap sentinel nor a value above the default min.
        it("should report the nonnegative failure first for a negative maxBet", () => {
            const result = gamblingConfigSchema.safeParse({ maxBet: -1 });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues.map((issue) => issue.message)).toEqual([
                    "Too small: expected number to be >=0",
                    "Maximum bet must be 0 (no cap) or >= minimum bet.",
                ]);
            }
        });
    });

    describe("numeric bounds", () => {
        it("should reject a minBet below 1", () => {
            const result = gamblingConfigSchema.safeParse({ minBet: 0 });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe(
                    "Too small: expected number to be >=1"
                );
            }
        });

        it("should accept a minBet of exactly 1", () => {
            expect(gamblingConfigSchema.safeParse({ minBet: 1 }).success).toBe(true);
        });

        it("should reject non-integer bet values", () => {
            expect(gamblingConfigSchema.safeParse({ minBet: 10.5 }).success).toBe(false);
            expect(gamblingConfigSchema.safeParse({ maxBet: 100.5 }).success).toBe(false);
        });

        it("should reject a negative cooldown", () => {
            const result = gamblingConfigSchema.safeParse({ cooldownSecs: -1 });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe(
                    "Too small: expected number to be >=0"
                );
            }
        });

        it("should accept a zero cooldown, meaning no cooldown", () => {
            expect(gamblingConfigSchema.safeParse({ cooldownSecs: 0 }).success).toBe(true);
        });

        it("should accept the inclusive timeoutSecs boundaries of 10 and 300", () => {
            expect(gamblingConfigSchema.safeParse({ timeoutSecs: 10 }).success).toBe(true);
            expect(gamblingConfigSchema.safeParse({ timeoutSecs: 300 }).success).toBe(true);
        });

        it("should reject a timeoutSecs outside the 10-300 range", () => {
            const low = gamblingConfigSchema.safeParse({ timeoutSecs: 9 });
            expect(low.success).toBe(false);
            if (!low.success) {
                expect(low.error.issues[0].message).toBe(
                    "Too small: expected number to be >=10"
                );
            }

            const high = gamblingConfigSchema.safeParse({ timeoutSecs: 301 });
            expect(high.success).toBe(false);
            if (!high.success) {
                expect(high.error.issues[0].message).toBe(
                    "Too big: expected number to be <=300"
                );
            }
        });

        it("should reject a non-integer timeoutSecs", () => {
            const result = gamblingConfigSchema.safeParse({ timeoutSecs: 60.5 });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe(
                    "Invalid input: expected int, received number"
                );
            }
        });
    });

    describe("type validation", () => {
        it("should reject a non-boolean enabled value", () => {
            const result = gamblingConfigSchema.safeParse({ enabled: "true" });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe(
                    "Invalid input: expected boolean, received string"
                );
            }
        });

        it("should reject non-numeric values for the numeric fields", () => {
            expect(gamblingConfigSchema.safeParse({ minBet: "10" }).success).toBe(false);
            expect(gamblingConfigSchema.safeParse({ cooldownSecs: "30" }).success).toBe(false);
            expect(gamblingConfigSchema.safeParse({ timeoutSecs: null }).success).toBe(false);
        });
    });

    describe("game toggles", () => {
        it.each([
            "blackjack",
            "coinflip",
            "slots",
            "roulette",
            "higherlower",
        ] as const)("should default %s to enabled", (game) => {
            const parsed = gamblingConfigSchema.parse({});

            expect(parsed[game]).toEqual({ enabled: true });
        });

        it("should keep an explicitly disabled game", () => {
            const parsed = gamblingConfigSchema.parse({ slots: { enabled: false } });

            expect(parsed.slots).toEqual({ enabled: false });
        });

        it("should default a game toggle supplied as an empty object", () => {
            const parsed = gamblingConfigSchema.parse({ roulette: {} });

            expect(parsed.roulette).toEqual({ enabled: true });
        });

        it("should leave the other games at their defaults when one is toggled", () => {
            const parsed = gamblingConfigSchema.parse({ blackjack: { enabled: false } });

            expect(parsed.blackjack).toEqual({ enabled: false });
            expect(parsed.coinflip).toEqual({ enabled: true });
            expect(parsed.slots).toEqual({ enabled: true });
            expect(parsed.roulette).toEqual({ enabled: true });
            expect(parsed.higherlower).toEqual({ enabled: true });
        });

        it("should reject a non-boolean toggle value", () => {
            const result = gamblingConfigSchema.safeParse({ blackjack: { enabled: "yes" } });

            expect(result.success).toBe(false);
            if (!result.success) {
                expect(result.error.issues[0].message).toBe(
                    "Invalid input: expected boolean, received string"
                );
                expect(result.error.issues[0].path).toEqual(["blackjack", "enabled"]);
            }
        });

        // A toggle that is disabled but carries extra keys is stripped, not carried
        // through to the bot.
        it("should strip unknown keys inside a game toggle", () => {
            const parsed = gamblingConfigSchema.parse({ slots: { enabled: true, payout: 90 } });

            expect(parsed.slots).toEqual({ enabled: true });
        });

        it("should allow every game to be disabled at once", () => {
            const disabledAll = {
                blackjack: { enabled: false },
                coinflip: { enabled: false },
                slots: { enabled: false },
                roulette: { enabled: false },
                higherlower: { enabled: false },
            };

            const result = gamblingConfigSchema.safeParse(disabledAll);

            expect(result.success).toBe(true);
            if (result.success) {
                expect(result.data.blackjack.enabled).toBe(false);
                expect(result.data.higherlower.enabled).toBe(false);
            }
        });
    });

    it("should parse a config where the module is disabled but bet values stay configured", () => {
        const result = gamblingConfigSchema.safeParse({
            enabled: false,
            minBet: 50,
            maxBet: 1000,
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.enabled).toBe(false);
            expect(result.data.minBet).toBe(50);
        }
    });
});