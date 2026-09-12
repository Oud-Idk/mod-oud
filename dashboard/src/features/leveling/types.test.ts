import { describe, it, expect } from "vitest";
import {
    levelingConfigSchema,
    notificationTargetSchema,
    saveXpMultiplierInputSchema,
    saveLevelRewardInputSchema,
    userLevelSchema,
    xpMultiplierSchema,
    levelRewardSchema,
    DEFAULT_LEVEL_NOTIFY_MESSAGE,
} from "./types";

describe("levelingConfigSchema", () => {
    it("should apply defaults when parsing an empty object", () => {
        const parsed = levelingConfigSchema.parse({});

        expect(parsed.text.enabled).toBe(false);
        expect(parsed.text.xpCooldown).toBe(60);
        expect(parsed.text.xpRange).toEqual({ min: 15, max: 25 });
        expect(parsed.text.xpOnTickets).toBe(false);

        expect(parsed.voice.enabled).toBe(false);
        expect(parsed.voice.xpRange).toEqual({ min: 25, max: 50 });

        expect(parsed.scope.mode).toBe("EXEMPT");
        expect(parsed.scope.roles).toEqual([]);
        expect(parsed.scope.channels).toEqual([]);

        expect(parsed.notify.scope).toBe("NONE");

        expect(parsed.imageCard.textColor).toBe("#FFFFFF");
        expect(parsed.imageCard.barForegroundColor).toBe("#5865f2");

        expect(parsed.levelCap).toBe(40);
        expect(parsed.keepLevelOnLeave).toBe(false);
    });

    it("should default the notify message layout", () => {
        const parsed = levelingConfigSchema.parse({});

        expect(parsed.notify.message).toEqual(DEFAULT_LEVEL_NOTIFY_MESSAGE);
    });

    it("should accept explicit nested settings", () => {
        const parsed = levelingConfigSchema.parse({
            text: { enabled: true, xpRange: { min: 10, max: 30 } },
            scope: { mode: "ENFORCED", roles: ["role_1"], channels: ["chan_1"] },
            levelCap: 100,
        });

        expect(parsed.text.enabled).toBe(true);
        expect(parsed.text.xpRange).toEqual({ min: 10, max: 30 });
        expect(parsed.scope.mode).toBe("ENFORCED");
        expect(parsed.levelCap).toBe(100);
    });
});

describe("notificationTargetSchema", () => {
    it("should PASS when notify scope is NONE", () => {
        const result = notificationTargetSchema.safeParse({ scope: "NONE" });
        expect(result.success).toBe(true);
    });

    it("should PASS when notify scope is CURRENT_CHANNEL or DM", () => {
        expect(notificationTargetSchema.safeParse({ scope: "CURRENT_CHANNEL" }).success).toBe(true);
        expect(notificationTargetSchema.safeParse({ scope: "DM" }).success).toBe(true);
    });

    it("should PASS when notify scope is SPECIFIED_CHANNEL with a channelId", () => {
        const result = notificationTargetSchema.safeParse({
            scope: "SPECIFIED_CHANNEL",
            channelId: "chan_1",
        });

        expect(result.success).toBe(true);
    });

    it("should REJECT SPECIFIED_CHANNEL without a target channel or with empty channelId", () => {
        const result = notificationTargetSchema.safeParse({
            scope: "SPECIFIED_CHANNEL",
            channelId: "",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "Please select a target channel for notifications!"
            );
        }
    });

    it("should reject an unknown scope", () => {
        expect(notificationTargetSchema.safeParse({ scope: "EVERYWHERE" }).success).toBe(false);
    });
});

describe("saveXpMultiplierInputSchema", () => {
    it("should default multiplier to 1", () => {
        const parsed = saveXpMultiplierInputSchema.parse({
            targetId: "role_1",
            targetType: "ROLE",
        });

        expect(parsed.multiplier).toBe(1);
    });

    it("should reject an empty targetId with appropriate union message", () => {
        const channelResult = saveXpMultiplierInputSchema.safeParse({
            targetId: "",
            targetType: "CHANNEL",
        });

        expect(channelResult.success).toBe(false);
        if (!channelResult.success) {
            expect(channelResult.error.issues[0].message).toBe("Target Channel ID is required");
        }

        const roleResult = saveXpMultiplierInputSchema.safeParse({
            targetId: "",
            targetType: "ROLE",
        });

        expect(roleResult.success).toBe(false);
        if (!roleResult.success) {
            expect(roleResult.error.issues[0].message).toBe("Target Role ID is required");
        }
    });

    it("should reject a non-positive multiplier", () => {
        const result = saveXpMultiplierInputSchema.safeParse({
            targetId: "chan_1",
            targetType: "CHANNEL",
            multiplier: 0,
        });

        expect(result.success).toBe(false);
    });

    it("should reject an unknown targetType", () => {
        const result = saveXpMultiplierInputSchema.safeParse({
            targetId: "role_1",
            targetType: "USER",
        });

        expect(result.success).toBe(false);
    });
});

describe("saveLevelRewardInputSchema", () => {
    it("should apply defaults for roles and removePreviousRoles", () => {
        const parsed = saveLevelRewardInputSchema.parse({ levelRequirement: 5 });

        expect(parsed.rolesToAdd).toEqual([]);
        expect(parsed.removePreviousRoles).toBe(false);
    });

    it("should reject a level requirement below 1", () => {
        const result = saveLevelRewardInputSchema.safeParse({ levelRequirement: 0 });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Level requirement must be at least 1");
        }
    });
});

describe("userLevelSchema", () => {
    it("should default XP and level fields to 0 and username to empty string", () => {
        const parsed = userLevelSchema.parse({
            guildId: "guild_123",
            userId: "user_123",
        });

        expect(parsed.cumulativeXp).toBe(0);
        expect(parsed.currentLevel).toBe(0);
        expect(parsed.currentXp).toBe(0);
        expect(parsed.username).toBe("");
    });

    it("should coerce string values into numbers", () => {
        const parsed = userLevelSchema.parse({
            guildId: "guild_123",
            userId: "user_123",
            cumulativeXp: "1500",
            currentLevel: "5",
            currentXp: "100",
        });

        expect(parsed.cumulativeXp).toBe(1500);
        expect(parsed.currentLevel).toBe(5);
        expect(parsed.currentXp).toBe(100);
    });
});

describe("xpMultiplierSchema and levelRewardSchema (DB rows)", () => {
    it("should default multiplier to 1", () => {
        const parsed = xpMultiplierSchema.parse({
            guildId: "guild_123",
            targetId: "role_1",
            targetType: "ROLE",
        });

        expect(parsed.multiplier).toBe(1);
    });

    it("should reject an unknown targetType in a DB row", () => {
        expect(
            xpMultiplierSchema.safeParse({
                guildId: "guild_123",
                targetId: "role_1",
                targetType: "USER",
            }).success
        ).toBe(false);
    });

    it("should apply defaults for level reward roles", () => {
        const parsed = levelRewardSchema.parse({
            levelRequirement: 5,
        });

        expect(parsed.rolesToAdd).toEqual([]);
        expect(parsed.removePreviousRoles).toBe(false);
    });

    it("should reject a level reward below level 1", () => {
        const result = levelRewardSchema.safeParse({ levelRequirement: 0 });

        expect(result.success).toBe(false);
    });
});