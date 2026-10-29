import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getGuildStats } from "./guild";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const MOD = "111111111111111111";
const OPENER = "222222222222222222";
const CHANNEL_1 = "333333333333333331";
const CHANNEL_2 = "333333333333333332";
const CHANNEL_3 = "333333333333333333";
const CHANNEL_4 = "333333333333333334";

function hoursAgo(hours: number): Date {
    return new Date(Date.now() - hours * 3_600_000);
}

async function seedModerationLog(guildId: string, createdAt: Date): Promise<void> {
    await db.query(
        `INSERT INTO moderation_logs (guild_id, moderator_id, action_type, created_at)
         VALUES ($1::bigint, $2::bigint, 'WARN', $3::timestamptz)`,
        [guildId, MOD, createdAt]
    );
}

async function seedTicket(
    guildId: string,
    channelId: string,
    status: "OPEN" | "CLOSED",
    createdAt: Date = new Date()
): Promise<void> {
    await db.query(
        `INSERT INTO tickets (guild_id, channel_id, opener_id, status, created_at)
         VALUES ($1::bigint, $2::bigint, $3::bigint, $4::TICKET_STATUS, $5::timestamptz)`,
        [guildId, channelId, OPENER, status, createdAt]
    );
}

describe("guild stats against a real database", () => {
    it("returns zeros for a guild with no data", async () => {
        expect(await getGuildStats(GUILD_A)).toEqual({
            weeklyModerationCount: 0,
            weeklyResolvedTicketCount: 0,
            openTicketsCount: 0,
        });
    });

    it("counts moderation logs from the last seven days as numbers", async () => {
        await seedModerationLog(GUILD_A, hoursAgo(24));
        await seedModerationLog(GUILD_A, hoursAgo(48));
        await seedModerationLog(GUILD_A, hoursAgo(24 * 8));

        const stats = await getGuildStats(GUILD_A);

        expect(stats.weeklyModerationCount).toBe(2);
        expect(typeof stats.weeklyModerationCount).toBe("number");
    });

    it("scopes moderation logs to the guild", async () => {
        await seedModerationLog(GUILD_A, hoursAgo(1));
        await seedModerationLog(GUILD_B, hoursAgo(1));
        await seedModerationLog(GUILD_B, hoursAgo(2));

        expect((await getGuildStats(GUILD_A)).weeklyModerationCount).toBe(1);
        expect((await getGuildStats(GUILD_B)).weeklyModerationCount).toBe(2);
    });

    it("counts closed tickets with no time window", async () => {
        await seedTicket(GUILD_A, CHANNEL_1, "CLOSED");
        await seedTicket(GUILD_A, CHANNEL_2, "CLOSED", hoursAgo(24 * 30));

        const stats = await getGuildStats(GUILD_A);

        expect(stats.weeklyResolvedTicketCount).toBe(2);
        expect(typeof stats.weeklyResolvedTicketCount).toBe("number");
    });

    it("separates open from closed tickets", async () => {
        await seedTicket(GUILD_A, CHANNEL_1, "OPEN");
        await seedTicket(GUILD_A, CHANNEL_2, "OPEN");
        await seedTicket(GUILD_A, CHANNEL_3, "CLOSED");

        const stats = await getGuildStats(GUILD_A);

        expect(stats.openTicketsCount).toBe(2);
        expect(stats.weeklyResolvedTicketCount).toBe(1);
    });

    it("scopes tickets to the guild", async () => {
        await seedTicket(GUILD_A, CHANNEL_1, "OPEN");
        await seedTicket(GUILD_B, CHANNEL_2, "OPEN");
        await seedTicket(GUILD_B, CHANNEL_3, "CLOSED");

        expect((await getGuildStats(GUILD_A)).openTicketsCount).toBe(1);
        expect((await getGuildStats(GUILD_B)).openTicketsCount).toBe(1);
        expect((await getGuildStats(GUILD_B)).weeklyResolvedTicketCount).toBe(1);
    });

    it("combines all three counts", async () => {
        await seedModerationLog(GUILD_A, hoursAgo(1));
        await seedModerationLog(GUILD_A, hoursAgo(2));
        await seedModerationLog(GUILD_A, hoursAgo(24 * 8));
        await seedTicket(GUILD_A, CHANNEL_1, "CLOSED");
        await seedTicket(GUILD_A, CHANNEL_2, "OPEN");
        await seedTicket(GUILD_A, CHANNEL_4, "OPEN");

        expect(await getGuildStats(GUILD_A)).toEqual({
            weeklyModerationCount: 2,
            weeklyResolvedTicketCount: 1,
            openTicketsCount: 2,
        });
    });
});
