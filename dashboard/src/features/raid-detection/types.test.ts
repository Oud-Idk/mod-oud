import { describe, it, expect } from "vitest";
import {
    raidActionKindSchema,
    raidDetectionInputSchema,
    saveRaidDetectionConfigSchema,
    raidActionSchema,
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
    it("should accept a LOCKDOWN_SERVER action and return exact parsed data", () => {
        const result = raidActionSchema.safeParse({ type: "LOCKDOWN_SERVER" });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({ type: "LOCKDOWN_SERVER" });
        }
    });

    it("should accept a BUMP_VERIFICATION action and return exact parsed data", () => {
        const result = raidActionSchema.safeParse({ type: "BUMP_VERIFICATION" });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({ type: "BUMP_VERIFICATION" });
        }
    });

    it("should accept an ALERT action with a channel and return exact parsed data", () => {
        const result = raidActionSchema.safeParse({ type: "ALERT", channelId: "chan_1" });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({ type: "ALERT", channelId: "chan_1" });
        }
    });

    it("should REJECT an ALERT action with empty channelId and return custom message", () => {
        const result = raidActionSchema.safeParse({ type: "ALERT", channelId: "" });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Alert channel is required");
        }
    });

    it("should accept a PAUSE_INVITES action and return exact parsed data", () => {
        const result = raidActionSchema.safeParse({ type: "PAUSE_INVITES", hour: 2 });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({ type: "PAUSE_INVITES", hour: 2 });
        }
    });

    it("should accept a TIMEOUT_NEW_JOINS action and return exact parsed data", () => {
        const result = raidActionSchema.safeParse({ type: "TIMEOUT_NEW_JOINS", mins: 10 });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({ type: "TIMEOUT_NEW_JOINS", mins: 10 });
        }
    });

    it("should accept an AUTO_BAN_NEW_ACCOUNTS action and return exact parsed data", () => {
        const result = raidActionSchema.safeParse({ type: "AUTO_BAN_NEW_ACCOUNTS", maxAgeHours: 24 });
        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data).toEqual({ type: "AUTO_BAN_NEW_ACCOUNTS", maxAgeHours: 24 });
        }
    });

    it("should REJECT an unknown action type and report invalid discriminator", () => {
        const result = raidActionSchema.safeParse({ type: "BAN_EVERYONE" });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].code).toBe("invalid_union");
        }
    });
});

describe("saveRaidDetectionConfigSchema", () => {
    it("should REJECT when enabled with no raid actions and set path and code", () => {
        const result = saveRaidDetectionConfigSchema.safeParse({
            enabled: true,
            raidActions: [],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].code).toBe("custom");
            expect(result.error.issues[0].message).toBe(
                "At least one raid mitigation action must be selected when raid protection is enabled!"
            );
            expect(result.error.issues[0].path).toEqual(["raidActions"]);
        }
    });
});

describe("saveRaidDetectionConfigSchema", () => {
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

describe("raidStatusSnapshotSchema", () => {
    it("should parse a valid snapshot", () => {
        const parsed = raidStatusSnapshotSchema.parse({
            currentJoinsInWindow: 12,
            windowSizeSeconds: 60,
            calculatedThreshold: 8,
            avgJoinsPerMin: 4.5,
            avgJoinsPerDay: 40.5,
            stdDevPerMin: 1.2,
            isRaidActive: true,
            statsAvailable: true,
        });

        expect(parsed.isRaidActive).toBe(true);
        expect(parsed.calculatedThreshold).toBe(8);
        expect(parsed.avgJoinsPerDay).toBe(40.5);
    });

    it("should REJECT a snapshot missing fields", () => {
        expect(raidStatusSnapshotSchema.safeParse({ currentJoinsInWindow: 1 }).success).toBe(false);
    });
});