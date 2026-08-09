import { describe, it, expect } from "vitest";
import {
    inviteTrackerConfigSchema,
    leaderboardEntrySchema,
    getLeaderboardInputSchema,
    defaultInviteTrackerConfig,
} from "./types";

describe("inviteTrackerConfigSchema", () => {
    it("should apply defaults when an empty object is parsed", () => {
        const parsed = inviteTrackerConfigSchema.parse({});

        expect(parsed.enabled).toBe(false);
        expect(defaultInviteTrackerConfig).toEqual(parsed);
    });

    it("should PASS an enabled config", () => {
        expect(inviteTrackerConfigSchema.safeParse({ enabled: true }).success).toBe(true);
    });

    it("should REJECT a non-boolean enabled value", () => {
        expect(inviteTrackerConfigSchema.safeParse({ enabled: "yes" }).success).toBe(false);
    });
});

describe("leaderboardEntrySchema", () => {
    it("should parse a valid leaderboard entry", () => {
        const parsed = leaderboardEntrySchema.parse({ inviterId: "user_1", count: 42 });

        expect(parsed.inviterId).toBe("user_1");
        expect(parsed.count).toBe(42);
    });

    it("should accept a count of 0", () => {
        expect(leaderboardEntrySchema.safeParse({ inviterId: "user_1", count: 0 }).success).toBe(
            true
        );
    });

    it("should REJECT a negative count", () => {
        expect(leaderboardEntrySchema.safeParse({ inviterId: "user_1", count: -1 }).success).toBe(
            false
        );
    });

    it("should REJECT a non-integer count", () => {
        expect(leaderboardEntrySchema.safeParse({ inviterId: "user_1", count: 2.5 }).success).toBe(
            false
        );
    });

    it("should REJECT a missing inviterId", () => {
        expect(leaderboardEntrySchema.safeParse({ count: 3 }).success).toBe(false);
    });
});

describe("getLeaderboardInputSchema", () => {
    it("should apply default limit and offset", () => {
        const parsed = getLeaderboardInputSchema.parse({ guildId: "guild_1" });

        expect(parsed.guildId).toBe("guild_1");
        expect(parsed.limit).toBe(15);
        expect(parsed.offset).toBe(0);
    });

    it("should accept an explicit limit and offset", () => {
        const parsed = getLeaderboardInputSchema.parse({ guildId: "guild_1", limit: 5, offset: 10 });

        expect(parsed.limit).toBe(5);
        expect(parsed.offset).toBe(10);
    });

    it("should REJECT an empty guildId", () => {
        expect(getLeaderboardInputSchema.safeParse({ guildId: "" }).success).toBe(false);
    });

    it("should REJECT a non-positive limit", () => {
        expect(getLeaderboardInputSchema.safeParse({ guildId: "g", limit: 0 }).success).toBe(false);
    });

    it("should REJECT a negative offset", () => {
        expect(getLeaderboardInputSchema.safeParse({ guildId: "g", offset: -1 }).success).toBe(
            false
        );
    });
});
