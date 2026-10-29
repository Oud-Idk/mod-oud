import { describe, expect, it, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { getRecentIncidents } from "./incidents";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const USER_MOD = "111111111111111111";
const USER_TARGET = "222222222222222222";

async function cleanupGuild(guildId: string): Promise<void> {
    await db.query(`DELETE FROM moderation_logs WHERE guild_id = $1::bigint`, [guildId]);
    await db.query(`DELETE FROM automod_logs WHERE guild_id = $1::bigint`, [guildId]);
    await db.query(`DELETE FROM raid_event_logs WHERE guild_id = $1::bigint`, [guildId]);
    await db.query(`DELETE FROM tickets WHERE guild_id = $1::bigint`, [guildId]);
}

async function seedDiscordUser(userId: string, username: string): Promise<void> {
    await db.query(
        `INSERT INTO discord_users (user_id, username)
         VALUES ($1::bigint, $2)
         ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username`,
        [userId, username]
    );
}

async function seedModerationLog(
    guildId: string,
    actionType: string,
    reason: string | null,
    createdAt: Date
): Promise<void> {
    await db.query(
        `INSERT INTO moderation_logs (guild_id, moderator_id, target_id, action_type, reason, created_at)
         VALUES ($1::bigint, $2::bigint, $3::bigint, $4, $5, $6::timestamptz)`,
        [guildId, USER_MOD, USER_TARGET, actionType, reason, createdAt]
    );
}

async function seedAutoModLog(
    guildId: string,
    ruleType: string,
    triggerContent: string | null,
    originalContent: string | null,
    createdAt: Date
): Promise<void> {
    await db.query(
        `INSERT INTO automod_logs (guild_id, user_id, rule_type, trigger_content, original_content, actions_taken, created_at)
         VALUES ($1::bigint, $2::bigint, $3, $4, $5, ARRAY['delete'], $6::timestamptz)`,
        [guildId, USER_TARGET, ruleType, triggerContent, originalContent, createdAt]
    );
}

async function seedRaidEvent(
    guildId: string,
    eventType: "TRIGGERED" | "RESOLVED" | "ACTION_APPLIED",
    details: Record<string, unknown> | null,
    createdAt: Date
): Promise<void> {
    await db.query(
        `INSERT INTO raid_event_logs (guild_id, event_type, details, created_at)
         VALUES ($1::bigint, $2::raid_event_type, $3::jsonb, $4::timestamptz)`,
        [guildId, eventType, details === null ? null : JSON.stringify(details), createdAt]
    );
}

async function seedTicket(
    guildId: string,
    channelId: string,
    status: "OPEN" | "CLOSED",
    createdAt: Date
): Promise<void> {
    await db.query(
        `INSERT INTO tickets (guild_id, channel_id, opener_id, status, created_at)
         VALUES ($1::bigint, $2::bigint, $3::bigint, $4::TICKET_STATUS, $5::timestamptz)`,
        [guildId, channelId, USER_TARGET, status, createdAt]
    );
}

describe("recent incidents against a real database", () => {
    beforeEach(async () => {
        await cleanupGuild(GUILD_A);
        await cleanupGuild(GUILD_B);
        await seedDiscordUser(USER_MOD, "ModOud");
        await seedDiscordUser(USER_TARGET, "Troublemaker");
    });

    it("enforces guild isolation across all incident tables", async () => {
        const now = Date.now();
        await seedModerationLog(GUILD_A, "BAN", "Spamming", new Date(now - 1_000));
        await seedModerationLog(GUILD_B, "KICK", "Guild B issue", new Date(now - 1_000));

        await seedAutoModLog(GUILD_A, "ZALGO", null, "Zalgo text", new Date(now - 2_000));
        await seedAutoModLog(GUILD_B, "SPAM", "fast", null, new Date(now - 2_000));

        await seedRaidEvent(GUILD_A, "RESOLVED", null, new Date(now - 3_000));
        await seedRaidEvent(GUILD_B, "TRIGGERED", null, new Date(now - 3_000));

        await seedTicket(GUILD_A, "300000000000000001", "OPEN", new Date(now - 4_000));
        await seedTicket(GUILD_B, "300000000000000002", "CLOSED", new Date(now - 4_000));

        const incidentsA = await getRecentIncidents(GUILD_A, 10);
        const incidentsB = await getRecentIncidents(GUILD_B, 10);

        expect(incidentsA).toHaveLength(4);
        expect(incidentsB).toHaveLength(4);

        expect(incidentsA.every((item) => item.href.includes(GUILD_A))).toBe(true);
        expect(incidentsB.every((item) => item.href.includes(GUILD_B))).toBe(true);
    });

    it("interleaves events from all 4 tables in strict chronological order", async () => {
        const now = Date.now();
        // Insert staggered in time
        await seedModerationLog(GUILD_A, "MUTE", "Rule 1", new Date(now - 40_000));
        await seedAutoModLog(GUILD_A, "INVITES", "discord.gg/xyz", null, new Date(now - 20_000));
        await seedRaidEvent(GUILD_A, "TRIGGERED", { message: "- Current joins in the past minute: 10" }, new Date(now - 10_000));
        await seedTicket(GUILD_A, "300000000000000003", "OPEN", new Date(now - 30_000));

        const incidents = await getRecentIncidents(GUILD_A, 10);

        expect(incidents.map((i) => i.kind)).toEqual([
            "RAID",       // -10s
            "AUTOMOD",    // -20s
            "TICKET",     // -30s
            "MODERATION", // -40s
        ]);
        expect(incidents[0]?.title).toBe("Raid detected");
        expect(incidents[1]?.details).toBe('Trigger: "discord.gg/xyz"');
        expect(incidents[2]?.details).toBe("Status: OPEN");
        expect(incidents[3]?.actor).toBe("ModOud");
        expect(incidents[3]?.target).toBe("Troublemaker");
    });

    it("falls back to user IDs when discord_users records do not exist", async () => {
        const unknownUser = "999999999999999999";
        await db.query(
            `INSERT INTO moderation_logs (guild_id, moderator_id, target_id, action_type, reason, created_at)
             VALUES ($1::bigint, $2::bigint, $2::bigint, 'WARN', 'Test', NOW())`,
            [GUILD_A, unknownUser]
        );

        const [incident] = await getRecentIncidents(GUILD_A, 1);

        expect(incident.actor).toBe(unknownUser);
        expect(incident.target).toBe(unknownUser);
    });

    it("limits total returned records across all tables", async () => {
        const now = Date.now();
        for (let i = 0; i < 5; i++) {
            await seedModerationLog(GUILD_A, "WARN", `Warn ${i.toString()}`, new Date(now - i * 1_000));
            await seedAutoModLog(GUILD_A, "SPAM", `spam ${i.toString()}`, null, new Date(now - i * 1_000 - 500));
        }

        const limited = await getRecentIncidents(GUILD_A, 3);
        expect(limited).toHaveLength(3);
    });
});