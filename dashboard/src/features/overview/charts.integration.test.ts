import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getAutomodBreakdown, getMemberFlow, getModerationActivity } from "./charts";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const USER = "111111111111111111";

function daysAgo(days: number, hourUtc = 12): Date {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    date.setUTCHours(hourUtc, 0, 0, 0);
    return date;
}

function utcDay(date: Date): string {
    return date.toISOString().slice(0, 10);
}

async function seedJoinLeave(guildId: string, action: "JOIN" | "LEAVE", createdAt: Date): Promise<void> {
    await db.query(
        `INSERT INTO join_leave_logs (user_id, guild_id, action, created_at)
         VALUES ($1::bigint, $2::bigint, $3::LOG_ACTION, $4::timestamptz)`,
        [USER, guildId, action, createdAt]
    );
}

async function seedModeration(guildId: string, action: string, createdAt: Date): Promise<void> {
    await db.query(
        `INSERT INTO moderation_logs (guild_id, moderator_id, action_type, created_at)
         VALUES ($1::bigint, $2::bigint, $3, $4::timestamptz)`,
        [guildId, USER, action, createdAt]
    );
}

async function seedAutomod(guildId: string, rule: string, createdAt: Date): Promise<void> {
    await db.query(
        `INSERT INTO automod_logs (guild_id, user_id, rule_type, actions_taken, created_at)
         VALUES ($1::bigint, $2::bigint, $3, ARRAY['delete'], $4::timestamptz)`,
        [guildId, USER, rule, createdAt]
    );
}

describe("member flow against a real database", () => {
    it("returns one zero-filled point per day, oldest first, ending today", async () => {
        const points = await getMemberFlow(GUILD_A, 7);

        expect(points).toHaveLength(7);
        expect(points[0]?.day).toBe(utcDay(daysAgo(6)));
        expect(points[6]?.day).toBe(utcDay(daysAgo(0)));
        expect(points.every((p) => p.joins === 0 && p.leaves === 0)).toBe(true);
    });

    it("buckets joins and leaves by UTC day within the window, for one guild", async () => {
        await seedJoinLeave(GUILD_A, "JOIN", daysAgo(1, 0));
        await seedJoinLeave(GUILD_A, "JOIN", daysAgo(1, 23));
        await seedJoinLeave(GUILD_A, "LEAVE", daysAgo(1));
        await seedJoinLeave(GUILD_A, "JOIN", daysAgo(10));
        await seedJoinLeave(GUILD_B, "JOIN", daysAgo(1));

        const points = await getMemberFlow(GUILD_A, 7);
        const yesterday = points.find((p) => p.day === utcDay(daysAgo(1)));

        expect(yesterday).toEqual({ day: utcDay(daysAgo(1)), joins: 2, leaves: 1 });
        expect(points.reduce((sum, p) => sum + p.joins, 0)).toBe(2);
    });
});

describe("moderation activity against a real database", () => {
    it("stacks actions per day and zero-fills the rest", async () => {
        await seedModeration(GUILD_A, "BAN", daysAgo(2));
        await seedModeration(GUILD_A, "WARN", daysAgo(2));
        await seedModeration(GUILD_A, "WARN", daysAgo(2));
        await seedModeration(GUILD_A, "UNLOCK", daysAgo(2));
        await seedModeration(GUILD_B, "KICK", daysAgo(2));

        const points = await getModerationActivity(GUILD_A, 7);

        expect(points).toHaveLength(7);
        expect(points.find((p) => p.day === utcDay(daysAgo(2)))).toEqual({
            day: utcDay(daysAgo(2)),
            bans: 1,
            kicks: 0,
            mutes: 0,
            warns: 2,
            other: 1,
        });
        expect(points.filter((p) => p.bans + p.kicks + p.mutes + p.warns + p.other > 0)).toHaveLength(1);
    });
});

describe("automod breakdown against a real database", () => {
    it("ranks rules by count within the window, for one guild", async () => {
        await seedAutomod(GUILD_A, "Spam", daysAgo(1));
        await seedAutomod(GUILD_A, "Spam", daysAgo(3));
        await seedAutomod(GUILD_A, "Zalgo", daysAgo(1));
        await seedAutomod(GUILD_A, "Zalgo", daysAgo(40));
        await seedAutomod(GUILD_B, "Zalgo", daysAgo(1));

        expect(await getAutomodBreakdown(GUILD_A, 30)).toEqual([
            { rule: "Spam", count: 2 },
            { rule: "Zalgo", count: 1 },
        ]);
    });

    it("caps the number of rules", async () => {
        await seedAutomod(GUILD_A, "Spam", daysAgo(1));
        await seedAutomod(GUILD_A, "Zalgo", daysAgo(1));

        expect(await getAutomodBreakdown(GUILD_A, 30, 1)).toHaveLength(1);
    });
});
