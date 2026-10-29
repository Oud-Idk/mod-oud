import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getAutomodBreakdown, getMemberFlow, getModerationActivity } from "./charts";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const USER = "111111111111111111";

function daysAgo(days: number, hourUtc = 12, minuteUtc = 0, secondUtc = 0, msUtc = 0): Date {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() - days);
    date.setUTCHours(hourUtc, minuteUtc, secondUtc, msUtc);
    return date;
}

function utcDay(date: Date): string {
    return date.toISOString().slice(0, 10);
}

async function cleanTables(): Promise<void> {
    await db.query(`DELETE FROM join_leave_logs WHERE guild_id IN ($1::bigint, $2::bigint)`, [GUILD_A, GUILD_B]);
    await db.query(`DELETE FROM moderation_logs WHERE guild_id IN ($1::bigint, $2::bigint)`, [GUILD_A, GUILD_B]);
    await db.query(`DELETE FROM automod_logs WHERE guild_id IN ($1::bigint, $2::bigint)`, [GUILD_A, GUILD_B]);
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
    beforeEach(async () => {
        await cleanTables();
    });

    it("returns one zero-filled point per day, oldest first, ending today", async () => {
        const points = await getMemberFlow(GUILD_A, 7);

        expect(points).toHaveLength(7);
        expect(points[0]?.day).toBe(utcDay(daysAgo(6)));
        expect(points[6]?.day).toBe(utcDay(daysAgo(0)));
        expect(points.every((p) => p.joins === 0 && p.leaves === 0)).toBe(true);
    });

    it("works correctly for a 1-day window", async () => {
        await seedJoinLeave(GUILD_A, "JOIN", daysAgo(0, 10));

        const points = await getMemberFlow(GUILD_A, 1);
        expect(points).toHaveLength(1);
        expect(points[0]).toEqual({ day: utcDay(daysAgo(0)), joins: 1, leaves: 0 });
    });

    it("respects exact UTC day boundaries and isolates guilds", async () => {
        // Oldest included day is 2 days ago for a 3-day window: (days - 1)
        // Upper bound: today at 23:59:59.999
        await seedJoinLeave(GUILD_A, "JOIN", daysAgo(0, 23, 59, 59, 999));
        // Lower bound: day (3 - 1 = 2) ago at 00:00:00.000 (INCLUDED)
        await seedJoinLeave(GUILD_A, "JOIN", daysAgo(2, 0, 0, 0, 0));
        // Just outside lower bound: day 3 ago at 23:59:59.999 (EXCLUDED)
        await seedJoinLeave(GUILD_A, "JOIN", daysAgo(3, 23, 59, 59, 999));
        // Different guild (EXCLUDED)
        await seedJoinLeave(GUILD_B, "JOIN", daysAgo(1, 12));

        const points = await getMemberFlow(GUILD_A, 3);
        const totalJoins = points.reduce((acc, cur) => acc + cur.joins, 0);

        expect(points).toHaveLength(3);
        expect(totalJoins).toBe(2);
    });
});

describe("moderation activity against a real database", () => {
    beforeEach(async () => {
        await cleanTables();
    });

    it("stacks actions per day, zero-fills unrepresented days, and filters out other guilds", async () => {
        await seedModeration(GUILD_A, "BAN", daysAgo(2));
        await seedModeration(GUILD_A, "SOFTBAN", daysAgo(2)); // maps to bans
        await seedModeration(GUILD_A, "WARN", daysAgo(2));
        await seedModeration(GUILD_A, "WARN", daysAgo(2));
        await seedModeration(GUILD_A, "CUSTOM_PUNISH", daysAgo(2)); // maps to other
        await seedModeration(GUILD_B, "KICK", daysAgo(2));          // excluded

        const points = await getModerationActivity(GUILD_A, 5);

        expect(points).toHaveLength(5);

        const targetDay = points.find((p) => p.day === utcDay(daysAgo(2)));
        expect(targetDay).toEqual({
            day: utcDay(daysAgo(2)),
            bans: 2,
            kicks: 0,
            mutes: 0,
            warns: 2,
            other: 1,
        });

        // Other 4 days should be all zeros
        const emptyDays = points.filter((p) => p.day !== utcDay(daysAgo(2)));
        expect(emptyDays.every((p) => p.bans === 0 && p.kicks === 0 && p.mutes === 0 && p.warns === 0 && p.other === 0)).toBe(true);
    });
});

describe("automod breakdown against a real database", () => {
    beforeEach(async () => {
        await cleanTables();
    });

    it("ranks rules by count within window and breaks ties alphabetically", async () => {
        // Equal counts (2 each)
        await seedAutomod(GUILD_A, "Zalgo", daysAgo(1));
        await seedAutomod(GUILD_A, "Zalgo", daysAgo(2));
        await seedAutomod(GUILD_A, "AntiSpam", daysAgo(1));
        await seedAutomod(GUILD_A, "AntiSpam", daysAgo(2));

        // Outside window (excluded)
        await seedAutomod(GUILD_A, "AntiSpam", daysAgo(35));
        // Other guild (excluded)
        await seedAutomod(GUILD_B, "Zalgo", daysAgo(1));

        const result = await getAutomodBreakdown(GUILD_A, 30);

        // Expect AntiSpam before Zalgo due to 'ORDER BY count DESC, rule_type'
        expect(result).toEqual([
            { rule: "AntiSpam", count: 2 },
            { rule: "Zalgo", count: 2 },
        ]);
    });

    it("respects the limit argument and returns empty if no logs exist", async () => {
        await seedAutomod(GUILD_A, "Rule1", daysAgo(1));
        await seedAutomod(GUILD_A, "Rule2", daysAgo(1));
        await seedAutomod(GUILD_A, "Rule3", daysAgo(1));

        const limitedResult = await getAutomodBreakdown(GUILD_A, 7, 2);
        expect(limitedResult).toHaveLength(2);

        const emptyGuildResult = await getAutomodBreakdown(GUILD_B, 7);
        expect(emptyGuildResult).toEqual([]);
    });
});