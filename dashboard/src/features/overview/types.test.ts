import { describe, expect, it } from "vitest";
import {
    DiscordGuildDetailsSchema,
    GuildStatsSchema,
    RawGuildStatsSchema,
} from "./types";

describe("overview types", () => {
    describe("RawGuildStatsSchema", () => {
        it("coerces numeric strings from COUNT(*) to numbers", () => {
            const parsed = RawGuildStatsSchema.parse({
                weekly_moderation: "2",
                weekly_resolved: "1",
                open_tickets: "3",
            });

            expect(parsed).toEqual({
                weekly_moderation: 2,
                weekly_resolved: 1,
                open_tickets: 3,
            });
        });

        it("treats null and undefined counts as zero", () => {
            const parsed = RawGuildStatsSchema.parse({
                weekly_moderation: null,
                weekly_resolved: undefined,
                open_tickets: null,
            });

            expect(parsed).toEqual({
                weekly_moderation: 0,
                weekly_resolved: 0,
                open_tickets: 0,
            });
        });

        it("rejects rows with missing keys", () => {
            expect(RawGuildStatsSchema.safeParse({}).success).toBe(false);
        });

        it("treats non-numeric strings as zero", () => {
            const parsed = RawGuildStatsSchema.parse({
                weekly_moderation: "not a number",
                weekly_resolved: "1",
                open_tickets: "2",
            });

            expect(parsed.weekly_moderation).toBe(0);
        });

        it("rejects rows that are not objects", () => {
            expect(RawGuildStatsSchema.safeParse("not an object").success).toBe(false);
        });
    });

    describe("GuildStatsSchema", () => {
        it("defaults every count to zero", () => {
            expect(GuildStatsSchema.parse({})).toEqual({
                weeklyModerationCount: 0,
                weeklyResolvedTicketCount: 0,
                openTicketsCount: 0,
            });
        });

        it("keeps provided counts", () => {
            expect(
                GuildStatsSchema.parse({
                    weeklyModerationCount: 2,
                    weeklyResolvedTicketCount: 1,
                    openTicketsCount: 3,
                })
            ).toEqual({
                weeklyModerationCount: 2,
                weeklyResolvedTicketCount: 1,
                openTicketsCount: 3,
            });
        });

        it("rejects non-numeric counts", () => {
            expect(
                GuildStatsSchema.safeParse({
                    weeklyModerationCount: "two",
                    weeklyResolvedTicketCount: 1,
                    openTicketsCount: 0,
                }).success
            ).toBe(false);
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
