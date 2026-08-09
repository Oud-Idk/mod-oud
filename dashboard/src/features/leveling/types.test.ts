import { describe, it, expect } from "vitest";
import {
    levelingConfigSchema,
    saveLevelingConfigSchema,
    saveXpMultiplierInputSchema,
    saveLevelRewardInputSchema,
    userLevelSchema,
    xpMultiplierSchema,
    levelRewardSchema,
    notificationScopeSchema,
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
        expect(parsed.notify.channelId).toBeNull();

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

describe("saveLevelingConfigSchema (.superRefine validation)", () => {
    const validConfig = levelingConfigSchema.parse({
        notify: { message: { format: "TEXT", content: "Level up!" } },
    });

    it("should PASS when notify scope is NONE without a channel", () => {
        const result = saveLevelingConfigSchema.safeParse({
            ...validConfig,
            notify: { ...validConfig.notify, scope: "NONE", channelId: null },
        });

        expect(result.success).toBe(true);
    });

    it("should PASS when notify scope is SPECIFIED_CHANNEL with a channel", () => {
        const result = saveLevelingConfigSchema.safeParse({
            ...validConfig,
            notify: { ...validConfig.notify, scope: "SPECIFIED_CHANNEL", channelId: "chan_1" },
        });

        expect(result.success).toBe(true);
    });

    it("should REJECT SPECIFIED_CHANNEL without a target channel", () => {
        const result = saveLevelingConfigSchema.safeParse({
            ...validConfig,
            notify: { ...validConfig.notify, scope: "SPECIFIED_CHANNEL", channelId: null },
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe(
                "Please select a target channel for level-up notifications!"
            );
        }
    });
});

describe("notificationScopeSchema", () => {
    it("should accept all known scopes and default to NONE", () => {
        expect(notificationScopeSchema.parse("CURRENT_CHANNEL")).toBe("CURRENT_CHANNEL");
        expect(notificationScopeSchema.parse("SPECIFIED_CHANNEL")).toBe("SPECIFIED_CHANNEL");
        expect(notificationScopeSchema.parse("DM")).toBe("DM");
        expect(notificationScopeSchema.parse(undefined)).toBe("NONE");
    });

    it("should reject an unknown scope", () => {
        expect(notificationScopeSchema.safeParse("EVERYWHERE").success).toBe(false);
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

    it("should reject an empty targetId", () => {
        const result = saveXpMultiplierInputSchema.safeParse({
            targetId: "",
            targetType: "CHANNEL",
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Target ID is required");
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
    it("should default XP and level fields to 0", () => {
        const parsed = userLevelSchema.parse({
            guild_id: "guild_123",
            user_id: "user_123",
        });

        expect(parsed.cumulative_xp).toBe(0);
        expect(parsed.current_level).toBe(0);
        expect(parsed.current_xp).toBe(0);
        expect(parsed.username).toBe("");
    });

    it("should reject negative XP values", () => {
        const result = userLevelSchema.safeParse({
            guild_id: "guild_123",
            user_id: "user_123",
            cumulative_xp: -1,
        });

        expect(result.success).toBe(false);
    });

    it("should reject a fractional level", () => {
        const result = userLevelSchema.safeParse({
            guild_id: "guild_123",
            user_id: "user_123",
            current_level: 3.5,
        });

        expect(result.success).toBe(false);
    });
});

describe("xpMultiplierSchema and levelRewardSchema (DB rows)", () => {
    it("should default multiplier to 1", () => {
        const parsed = xpMultiplierSchema.parse({
            guild_id: "guild_123",
            target_id: "role_1",
            target_type: "ROLE",
        });

        expect(parsed.multiplier).toBe(1);
    });

    it("should reject an unknown target_type in a DB row", () => {
        expect(
            xpMultiplierSchema.safeParse({
                guild_id: "guild_123",
                target_id: "role_1",
                target_type: "USER",
            }).success
        ).toBe(false);
    });

    it("should apply defaults for level reward roles", () => {
        const parsed = levelRewardSchema.parse({
            level_requirement: 5,
        });

        expect(parsed.roles_to_add).toEqual([]);
        expect(parsed.remove_previous_roles).toBe(false);
    });

    it("should reject a level reward below level 1", () => {
        const result = levelRewardSchema.safeParse({ level_requirement: 0 });

        expect(result.success).toBe(false);
    });
});
