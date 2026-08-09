import { describe, it, expect } from "vitest";
import {
    raidActionKindSchema,
    raidDetectionInputSchema,
    saveRaidDetectionConfigSchema,
    raidActionSchema,
    cachedStatsSchema,
    raidStatusSnapshotSchema,
} from "./types";

// Kills all 7 raidActionKindSchema mutants
describe("raidActionKindSchema", () => {
    it("should accept all valid action kinds", () => {
        const kinds = [
            "ALERT",
            "LOCKDOWN_SERVER",
            "PAUSE_INVITES",
            "BUMP_VERIFICATION",
            "AUTO_BAN_NEW_ACCOUNTS",
            "TIMEOUT_NEW_JOINS",
        ] as const;

        kinds.forEach((kind) => {
            expect(raidActionKindSchema.safeParse(kind).success).toBe(true);
        });
    });

    it("should REJECT an invalid action kind", () => {
        expect(raidActionKindSchema.safeParse("INVALID_KIND").success).toBe(false);
    });
});

describe("raidDetectionInputSchema", () => {
    it("should apply defaults when an empty object is parsed", () => {
        const parsed = raidDetectionInputSchema.parse({});

        expect(parsed.enabled).toBe(false);
        expect(parsed.zScoreMultiplier).toBe(3);
        expect(parsed.minSafeLimit).toBe(5);
        expect(parsed.windowSizeSeconds).toBe(60);
        expect(parsed.raidActions).toEqual([]);
    });

    it("should PASS a fully configured config", () => {
        const result = raidDetectionInputSchema.safeParse({
            enabled: true,
            zScoreMultiplier: 4,
            minSafeLimit: 10,
            windowSizeSeconds: 120,
            raidActions: [
                { type: "LOCKDOWN_SERVER" },
                { type: "ALERT", channelId: "chan_1" },
                { type: "PAUSE_INVITES", hour: 2 },
            ],
        });

        expect(result.success).toBe(true);
    });
});

describe("raidActionSchema (discriminated union)", () => {
    it("should accept a LOCKDOWN_SERVER action with no extras", () => {
        expect(raidActionSchema.safeParse({ type: "LOCKDOWN_SERVER" }).success).toBe(true);
    });

    // Kills BUMP_VERIFICATION literal mutant
    it("should accept a BUMP_VERIFICATION action", () => {
        expect(raidActionSchema.safeParse({ type: "BUMP_VERIFICATION" }).success).toBe(true);
    });

    it("should accept an ALERT action with a channel", () => {
        const result = raidActionSchema.safeParse({ type: "ALERT", channelId: "chan_1" });
        expect(result.success).toBe(true);
    });

    // Kills ALERT error message mutant ("Alert channel is required")
    it("should REJECT an ALERT action with an empty channel and set correct error message", () => {
        const result = raidActionSchema.safeParse({ type: "ALERT", channelId: "" });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Alert channel is required");
        }
    });

    it("should REJECT a PAUSE_INVITES action with a zero hour", () => {
        expect(raidActionSchema.safeParse({ type: "PAUSE_INVITES", hour: 0 }).success).toBe(false);
    });

    // Kills TIMEOUT_NEW_JOINS literal mutant
    it("should accept a TIMEOUT_NEW_JOINS action with valid mins", () => {
        expect(raidActionSchema.safeParse({ type: "TIMEOUT_NEW_JOINS", mins: 10 }).success).toBe(
            true
        );
    });

    it("should REJECT a TIMEOUT_NEW_JOINS action with a zero mins", () => {
        expect(raidActionSchema.safeParse({ type: "TIMEOUT_NEW_JOINS", mins: 0 }).success).toBe(
            false
        );
    });

    // Kills AUTO_BAN_NEW_ACCOUNTS literal mutant and .min(1) vs .max(1) mutant
    it("should accept an AUTO_BAN_NEW_ACCOUNTS action with valid maxAgeHours (> 1)", () => {
        expect(
            raidActionSchema.safeParse({ type: "AUTO_BAN_NEW_ACCOUNTS", maxAgeHours: 24 }).success
        ).toBe(true);
    });

    it("should REJECT an AUTO_BAN_NEW_ACCOUNTS action with zero maxAgeHours", () => {
        expect(
            raidActionSchema.safeParse({ type: "AUTO_BAN_NEW_ACCOUNTS", maxAgeHours: 0 }).success
        ).toBe(false);
    });

    it("should REJECT an unknown action type", () => {
        expect(raidActionSchema.safeParse({ type: "BAN_EVERYONE" }).success).toBe(false);
    });
});

describe("saveRaidDetectionConfigSchema", () => {
    // Kills path: ["raidActions"] -> path: [] / [""] mutants
    it("should REJECT when enabled with no raid actions and set path to raidActions", () => {
        const result = saveRaidDetectionConfigSchema.safeParse({
            enabled: true,
            raidActions: [],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "At least one raid mitigation action must be selected when raid protection is enabled!"
            );
            expect(result.error.issues[0].path).toEqual(["raidActions"]);
        }
    });

    it("should PASS when enabled with at least one action", () => {
        const result = saveRaidDetectionConfigSchema.safeParse({
            enabled: true,
            raidActions: [{ type: "ALERT", channelId: "chan_1" }],
        });

        expect(result.success).toBe(true);
    });

    it("should PASS when disabled with no actions", () => {
        const result = saveRaidDetectionConfigSchema.safeParse({
            enabled: false,
            raidActions: [],
        });

        expect(result.success).toBe(true);
    });
});

describe("cachedStatsSchema", () => {
    it("should parse valid cached stats", () => {
        const parsed = cachedStatsSchema.parse({
            threshold: 10,
            mean_window: 5,
            std_dev_window: 2,
        });

        expect(parsed.threshold).toBe(10);
        expect(parsed.mean_window).toBe(5);
        expect(parsed.std_dev_window).toBe(2);
    });

    it("should REJECT cached stats missing a field", () => {
        expect(cachedStatsSchema.safeParse({ threshold: 10 }).success).toBe(false);
    });
});

describe("raidStatusSnapshotSchema", () => {
    it("should parse a valid snapshot", () => {
        const parsed = raidStatusSnapshotSchema.parse({
            currentJoinsInWindow: 12,
            windowSizeSeconds: 60,
            calculatedThreshold: 8,
            avgJoinsPerMin: 4.5,
            stdDevPerMin: 1.2,
            isRaidActive: true,
            statsAvailable: true,
        });

        expect(parsed.isRaidActive).toBe(true);
        expect(parsed.calculatedThreshold).toBe(8);
    });

    it("should REJECT a snapshot missing fields", () => {
        expect(raidStatusSnapshotSchema.safeParse({ currentJoinsInWindow: 1 }).success).toBe(false);
    });
});