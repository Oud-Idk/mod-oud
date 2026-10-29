import { describe, it, expect } from "vitest";
import { buildFeatureCategories } from "./featureMatrix";

describe("buildFeatureCategories", () => {
    it("builds all 4 groups with correct active flags and descriptions", () => {
        const categories = buildFeatureCategories({
            guildId: "guild_123",
            mfEnabled: true,
            mfActiveCount: 3,
            antiRaidEnabled: false,
            dynSlowmodeEnabled: true,
            honeypotEnabled: false,
            reportEnabled: true,
            msgLoggingEnabled: false,
            modDmsEnabled: false,
            levelingEnabled: true,
            starboardsCount: 2,
            reactionRolesCount: 0,
            giveawaysCount: 1,
            economyEnabled: true,
            gamblingEnabled: false,
            birthdayEnabled: true,
            customCmdsCount: 5,
            ticketsEnabled: true,
            memberCounterEnabled: false,
            remindersCount: 0,
            rssCount: 3,
            tempVoiceCount: 0,
            mediaOnlyCount: 1,
            inviteTrackingEnabled: false,
            welcomeEnabled: true,
            verificationEnabled: true,
            leaveEnabled: false,
        });

        expect(categories).toHaveLength(4);
        expect(categories.map((c) => c.title)).toEqual([
            "Moderation & Security",
            "Engagement & Fun",
            "Utility & Tools",
            "Onboarding",
        ]);

        const modSec = categories.find((c) => c.title === "Moderation & Security");
        expect(modSec?.features.find((f) => f.id === "message-filtering")?.enabled).toBe(true);
        expect(modSec?.features.find((f) => f.id === "message-filtering")?.description).toBe("3 active rules");
        expect(modSec?.features.find((f) => f.id === "anti-raid")?.enabled).toBe(false);

        const fun = categories.find((c) => c.title === "Engagement & Fun");
        expect(fun?.features.find((f) => f.id === "starboard")?.enabled).toBe(true);
        expect(fun?.features.find((f) => f.id === "starboard")?.description).toBe("2 boards active");
        expect(fun?.features.find((f) => f.id === "reaction-roles")?.enabled).toBe(false);

        const utility = categories.find((c) => c.title === "Utility & Tools");
        expect(utility?.features.find((f) => f.id === "custom-commands")?.enabled).toBe(true);
        expect(utility?.features.find((f) => f.id === "custom-commands")?.description).toBe("5 commands");

        const onboarding = categories.find((c) => c.title === "Onboarding");
        expect(onboarding?.features.find((f) => f.id === "verification")?.enabled).toBe(true);
        expect(onboarding?.features.find((f) => f.id === "leave")?.enabled).toBe(false);
    });
});
