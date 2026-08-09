import { describe, it, expect } from "vitest";
import {
    raidDetectionInputSchema,
    saveRaidDetectionConfigSchema,
    raidActionSchema,
    cachedStatsSchema,
    raidStatusSnapshotSchema,
} from "./types";

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

    it("should accept an ALERT action with a channel", () => {
        const result = raidActionSchema.safeParse({ type: "ALERT", channelId: "chan_1" });
        expect(result.success).toBe(true);
    });

    it("should REJECT an ALERT action without a channel", () => {
        const result = raidActionSchema.safeParse({ type: "ALERT" });
        expect(result.success).toBe(false);
    });

    it("should REJECT a PAUSE_INVITES action with a zero hour", () => {
        expect(raidActionSchema.safeParse({ type: "PAUSE_INVITES", hour: 0 }).success).toBe(false);
    });

    it("should REJECT a TIMEOUT_NEW_JOINS action with a zero mins", () => {
        expect(raidActionSchema.safeParse({ type: "TIMEOUT_NEW_JOINS", mins: 0 }).success).toBe(
            false
        );
    });

    it("should REJECT an unknown action type", () => {
        expect(raidActionSchema.safeParse({ type: "BAN_EVERYONE" }).success).toBe(false);
    });
});

describe("saveRaidDetectionConfigSchema", () => {
    it("should REJECT when enabled with no raid actions", () => {
        const result = saveRaidDetectionConfigSchema.safeParse({
            enabled: true,
            raidActions: [],
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "At least one raid mitigation action must be selected when raid protection is enabled!"
            );
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
