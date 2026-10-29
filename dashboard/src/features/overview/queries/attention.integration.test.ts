import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getAttentionItems } from "./attention";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const USER = "111111111111111111";
const HOUR = 3_600_000;

let nextChannel = 333333333333333300n;
function channel(): string {
    nextChannel += 1n;
    return nextChannel.toString();
}

function fromNow(hours: number): Date {
    return new Date(Date.now() + hours * HOUR);
}

async function seedTicket(guildId: string, status: "OPEN" | "CLOSED", createdAt: Date): Promise<void> {
    await db.query(
        `INSERT INTO tickets (guild_id, channel_id, opener_id, status, created_at)
         VALUES ($1::bigint, $2::bigint, $3::bigint, $4::TICKET_STATUS, $5::timestamptz)`,
        [guildId, channel(), USER, status, createdAt]
    );
}

async function seedGiveaway(guildId: string, endTime: Date, finished = false): Promise<void> {
    await db.query(
        `INSERT INTO giveaways (guild_id, host_id, prize, end_time, is_finished)
         VALUES ($1::bigint, $2::bigint, 'Nitro', $3::timestamptz, $4)`,
        [guildId, USER, endTime, finished]
    );
}

async function seedTempBan(guildId: string, unbanAt: Date): Promise<void> {
    await db.query(
        `INSERT INTO temp_bans (guild_id, user_id, unban_at)
         VALUES ($1::bigint, $2::bigint, $3::timestamptz)`,
        [guildId, USER, unbanAt]
    );
}

async function seedReminder(guildId: string, failureCount: number, active = true): Promise<void> {
    await db.query(
        `INSERT INTO reminders (guild_id, channel_id, next_trigger_at, failure_count, is_active)
         VALUES ($1::bigint, $2::bigint, NOW(), $3, $4)`,
        [guildId, channel(), failureCount, active]
    );
}

describe("attention items against a real database", () => {
    it("returns nothing for a quiet guild", async () => {
        await seedTicket(GUILD_B, "OPEN", new Date());
        await seedReminder(GUILD_B, 3);

        expect(await getAttentionItems(GUILD_A)).toEqual([]);
    });

    it("counts open tickets and reports the oldest", async () => {
        await seedTicket(GUILD_A, "OPEN", fromNow(-50));
        await seedTicket(GUILD_A, "OPEN", fromNow(-1));
        await seedTicket(GUILD_A, "CLOSED", fromNow(-100));

        expect(await getAttentionItems(GUILD_A)).toEqual([
            expect.objectContaining({ kind: "OPEN_TICKETS", title: "2 open tickets", detail: "Oldest opened 2d ago" }),
        ]);
    });

    it("counts only unfinished giveaways ending inside the window", async () => {
        await seedGiveaway(GUILD_A, fromNow(3.5));
        await seedGiveaway(GUILD_A, fromNow(10));
        await seedGiveaway(GUILD_A, fromNow(48));
        await seedGiveaway(GUILD_A, fromNow(2), true);

        expect(await getAttentionItems(GUILD_A)).toEqual([
            expect.objectContaining({ kind: "GIVEAWAYS_ENDING", title: "2 giveaways ending soon", detail: "Next ends in 3h" }),
        ]);
    });

    it("counts only temp bans lifting inside the window", async () => {
        await seedTempBan(GUILD_A, fromNow(5.5));
        await seedTempBan(GUILD_A, fromNow(72));

        expect(await getAttentionItems(GUILD_A)).toEqual([
            expect.objectContaining({ kind: "TEMP_BANS_EXPIRING", title: "1 temp ban expiring soon", detail: "Next unban in 5h" }),
        ]);
    });

    it("counts only active reminders that have failed", async () => {
        await seedReminder(GUILD_A, 2);
        await seedReminder(GUILD_A, 0);
        await seedReminder(GUILD_A, 5, false);

        expect(await getAttentionItems(GUILD_A)).toEqual([
            expect.objectContaining({ kind: "FAILING_REMINDERS", title: "1 reminder failing to send" }),
        ]);
    });
});
