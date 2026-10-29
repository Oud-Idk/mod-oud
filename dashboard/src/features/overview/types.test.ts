import { describe, expect, it } from "vitest";
import {
    DiscordGuildDetailsSchema,
    RawWeeklyStatsSchema,
} from "./types";

const ZERO_ROW = {
    joins_current: 0,
    joins_previous: 0,
    leaves_current: 0,
    leaves_previous: 0,
    moderation_current: 0,
    moderation_previous: 0,
    automod_current: 0,
    automod_previous: 0,
    tickets_current: 0,
    tickets_previous: 0,
};

describe("overview types", () => {
    describe("RawWeeklyStatsSchema", () => {
        it("coerces numeric strings from COUNT(*) to numbers", () => {
            const parsed = RawWeeklyStatsSchema.parse({ ...ZERO_ROW, joins_current: "2", tickets_previous: "3" });

            expect(parsed.joins_current).toBe(2);
            expect(parsed.tickets_previous).toBe(3);
        });

        it("treats null and non-numeric counts as zero", () => {
            const parsed = RawWeeklyStatsSchema.parse({
                ...ZERO_ROW,
                moderation_current: null,
                automod_current: "not a number",
            });

            expect(parsed.moderation_current).toBe(0);
            expect(parsed.automod_current).toBe(0);
        });

        it("rejects rows with missing keys", () => {
            expect(RawWeeklyStatsSchema.safeParse({}).success).toBe(false);
        });

        it("rejects rows that are not objects", () => {
            expect(RawWeeklyStatsSchema.safeParse("not an object").success).toBe(false);
        });
    });

    describe("DiscordGuildDetailsSchema", () => {
        it("accepts a minimal payload", () => {
            expect(
                DiscordGuildDetailsSchema.safeParse({
                    id: "guild_123",
                    name: "Test Guild",
                    icon: null,
                }).success
            ).toBe(true);
        });

        it("rejects a payload missing the name", () => {
            expect(DiscordGuildDetailsSchema.safeParse({ id: "guild_123" }).success).toBe(
                false
            );
        });
    });
});
