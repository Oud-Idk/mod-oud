import { describe, it, expect } from "vitest";
import {
    messageFilteringConfigSchema,
    patternSchema,
    scopeSchema,
    saveBadWordRulesetInputSchema,
    badWordRulesetSchema,
    defaultMessageFilteringConfig,
} from "./types";

describe("messageFilteringConfigSchema", () => {
    it("should apply defaults for every rule when an empty object is parsed", () => {
        const parsed = messageFilteringConfigSchema.parse({});

        expect(parsed.badWords.patterns).toEqual([]);
        expect(parsed.badWords.action).toEqual([]);
        expect(parsed.externalLinks.blockOnlyMalicious).toBe(true);
        expect(parsed.excessiveCaps.threshold).toBe(0.7);
        expect(parsed.excessiveEmojis.maxEmojis).toBe(10);
        expect(parsed.excessiveSpoilers.threshold).toBe(0.5);
        expect(parsed.excessiveMentions.maxMentions).toBe(5);
        expect(parsed.antiSpam.messagesPerWindow).toBe(8);
        expect(parsed.antiSpam.windowSeconds).toBe(5);
        expect(parsed.offensiveMessages.flagThreshold).toBe("MODERATE");
        expect(parsed.globalSettings.mode).toBe("EXEMPT");
        expect(defaultMessageFilteringConfig).toEqual(parsed);
    });

    it("should PASS a fully configured config", () => {
        const result = messageFilteringConfigSchema.safeParse({
            badWords: {
                enabled: true,
                action: ["WARN"],
                patterns: [{ value: "badword", strategy: "EXACT" }],
            },
            excessiveCaps: { enabled: true, threshold: 0.9, minLength: 5 },
            globalSettings: { mode: "ENFORCED", roles: ["role_1"] },
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.badWords.patterns[0].value).toBe("badword");
            expect(result.data.globalSettings.mode).toBe("ENFORCED");
        }
    });

    it("should REJECT an unknown rule action", () => {
        const result = messageFilteringConfigSchema.safeParse({
            badWords: { action: ["BAN"] },
        });

        expect(result.success).toBe(false);
    });

    it("should REJECT an unknown strategy", () => {
        const result = messageFilteringConfigSchema.safeParse({
            badWords: { patterns: [{ value: "x", strategy: "FUZZY" }] },
        });

        expect(result.success).toBe(false);
    });
});

describe("patternSchema", () => {
    it("should apply the EXACT strategy default", () => {
        const parsed = patternSchema.parse({ value: "hello" });
        expect(parsed.strategy).toBe("EXACT");
    });

    it("should REJECT an empty pattern value", () => {
        const result = patternSchema.safeParse({ value: "" });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Pattern cannot be empty");
        }
    });
});

describe("scopeSchema", () => {
    it("should apply defaults when an empty object is parsed", () => {
        const parsed = scopeSchema.parse({});
        expect(parsed.mode).toBe("EXEMPT");
        expect(parsed.roles).toEqual([]);
        expect(parsed.channels).toEqual([]);
    });

    it("should REJECT an unknown scope mode", () => {
        expect(scopeSchema.safeParse({ mode: "ACTIVE" }).success).toBe(false);
    });
});

describe("saveBadWordRulesetInputSchema", () => {
    it("should PASS a minimal valid ruleset", () => {
        const result = saveBadWordRulesetInputSchema.safeParse({ name: "Profanity" });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.enabled).toBe(true);
            expect(result.data.patterns).toEqual([]);
            expect(result.data.actions).toEqual([]);
        }
    });

    it("should REJECT an empty ruleset name", () => {
        const result = saveBadWordRulesetInputSchema.safeParse({ name: "" });
        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.error.issues[0].message).toBe("Ruleset name is required");
        }
    });

    it("should PASS a fully configured ruleset", () => {
        const result = saveBadWordRulesetInputSchema.safeParse({
            name: "No swears",
            enabled: true,
            patterns: [{ value: "darn", strategy: "SUBSTRING" }],
            actions: ["DELETE", "WARN"],
            timeoutDurationSeconds: 60,
        });

        expect(result.success).toBe(true);
    });
});

describe("badWordRulesetSchema", () => {
    it("should parse a DB row with dates", () => {
        const result = badWordRulesetSchema.safeParse({
            id: "uuid_1",
            guildId: "guild_123",
            name: "No swears",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
        });

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.data.enabled).toBe(true);
            expect(result.data.createdAt).toBeInstanceOf(Date);
            expect(result.data.updatedAt).toBeInstanceOf(Date);
        }
    });

    it("should REJECT a row missing an id", () => {
        const result = badWordRulesetSchema.safeParse({ name: "No swears" });
        expect(result.success).toBe(false);
    });
});
