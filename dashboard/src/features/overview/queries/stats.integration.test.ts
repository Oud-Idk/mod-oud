import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getWeeklyStats } from "./stats";
import { StatCardId } from "../types";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const USER = "111111111111111111";

let nextChannel = 444444444444444400n;
function channel(): string {
    nextChannel += 1n;
    return nextChannel.toString();
}

function daysAgo(days: number): Date {
    return new Date(Date.now() - days * 86_400_000);
}

async function seedJoinLeave(guildId: string, action: "JOIN" | "LEAVE", createdAt: Date): Promise<void> {
    await db.query(
        `INSERT INTO join_leave_logs (user_id, guild_id, action, created_at)
         VALUES ($1::bigint, $2::bigint, $3::LOG_ACTION, $4::timestamptz)`,
        [USER, guildId, action, createdAt]
    );
}

async function seedModeration(guildId: string, createdAt: Date): Promise<void> {
    await db.query(
        `INSERT INTO moderation_logs (guild_id, moderator_id, action_type, created_at)
         VALUES ($1::bigint, $2::bigint, 'WARN', $3::timestamptz)`,
        [guildId, USER, createdAt]
    );
}

async function seedAutomod(guildId: string, createdAt: Date): Promise<void> {
    await db.query(
        `INSERT INTO automod_logs (guild_id, user_id, rule_type, actions_taken, created_at)
         VALUES ($1::bigint, $2::bigint, 'Spam', ARRAY['delete'], $3::timestamptz)`,
        [guildId, USER, createdAt]
    );
}

async function seedTicket(guildId: string, createdAt: Date): Promise<void> {
    await db.query(
        `INSERT INTO tickets (guild_id, channel_id, opener_id, created_at)
         VALUES ($1::bigint, $2::bigint, $3::bigint, $4::timestamptz)`,
        [guildId, channel(), USER, createdAt]
    );
}

async function card(guildId: string, id: StatCardId): Promise<{ value: string; delta: string } | undefined> {
    return (await getWeeklyStats(guildId))?.find((c) => c.id === id);
}

describe("weekly stats against a real database", () => {
    it("returns four zero cards for a quiet guild", async () => {
        const cards = await getWeeklyStats(GUILD_A);

        expect(cards).toHaveLength(4);
        expect(cards?.every((c) => c.value === "0" && c.delta === "No change vs prior 7d")).toBe(true);
    });

    it("nets joins against leaves and compares with the prior week", async () => {
        await seedJoinLeave(GUILD_A, "JOIN", daysAgo(1));
        await seedJoinLeave(GUILD_A, "JOIN", daysAgo(2));
        await seedJoinLeave(GUILD_A, "JOIN", daysAgo(3));
        await seedJoinLeave(GUILD_A, "LEAVE", daysAgo(1));
        await seedJoinLeave(GUILD_A, "JOIN", daysAgo(10));
        await seedJoinLeave(GUILD_A, "JOIN", daysAgo(30));

        expect(await card(GUILD_A, "member_growth")).toMatchObject({ value: "+2", delta: "+1 vs prior 7d" });
    });

    it("splits moderation, automod and tickets into the two windows", async () => {
        await seedModeration(GUILD_A, daysAgo(1));
        await seedModeration(GUILD_A, daysAgo(8));
        await seedModeration(GUILD_A, daysAgo(9));
        await seedModeration(GUILD_A, daysAgo(20));
        await seedAutomod(GUILD_A, daysAgo(2));
        await seedAutomod(GUILD_A, daysAgo(3));
        await seedTicket(GUILD_A, daysAgo(12));

        expect(await card(GUILD_A, "moderation")).toMatchObject({ value: "1", delta: "-1 vs prior 7d" });
        expect(await card(GUILD_A, "automod")).toMatchObject({ value: "2", delta: "+2 vs prior 7d" });
        expect(await card(GUILD_A, "tickets")).toMatchObject({ value: "0", delta: "-1 vs prior 7d" });
    });

    it("scopes every count to the guild", async () => {
        await seedJoinLeave(GUILD_B, "JOIN", daysAgo(1));
        await seedModeration(GUILD_B, daysAgo(1));
        await seedAutomod(GUILD_B, daysAgo(1));
        await seedTicket(GUILD_B, daysAgo(1));

        expect((await getWeeklyStats(GUILD_A))?.every((c) => c.value === "0")).toBe(true);
        expect((await getWeeklyStats(GUILD_B))?.every((c) => c.value !== "0")).toBe(true);
    });
});
