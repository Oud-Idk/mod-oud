import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
    getAutomodLogs,
    getJoinLeaveLogs,
    getModerationLogs,
} from "./queries";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const USER_A = "111111111111111111";
const USER_B = "222222222222222222";
const MOD_A = "333333333333333333";
const CHANNEL_A = "444444444444444444";
const MESSAGE_A = "555555555555555555";

async function seedDiscordUser(userId: string, username: string): Promise<void> {
    await db.query(
        `INSERT INTO discord_users (user_id, username)
         VALUES ($1::bigint, $2)
         ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username`,
        [userId, username]
    );
}

describe("automod logs against a real database", () => {
    it("returns an empty array for a guild with no logs", async () => {
        expect(await getAutomodLogs(GUILD_A)).toEqual([]);
    });

    it("maps a row through the discord_users LEFT JOIN", async () => {
        await seedDiscordUser(USER_A, "SpicyWolf");
        const createdAt = "2026-01-02T00:00:00.000Z";
        const { rows } = await db.query<{ id: string }>(
            `INSERT INTO automod_logs
                (guild_id, user_id, channel_id, message_id, rule_type, trigger_content, original_content, actions_taken, created_at)
             VALUES ($1::bigint, $2::bigint, $3::bigint, $4::bigint, 'BAD_WORD', 'spam', 'hello spam', ARRAY['delete','warn'], $5::timestamptz)
             RETURNING id`,
            [GUILD_A, USER_A, CHANNEL_A, MESSAGE_A, createdAt]
        );

        const [log] = await getAutomodLogs(GUILD_A);

        expect(log.id).toBe(rows[0].id);
        expect(log.guild_id).toBe(GUILD_A);
        expect(log.user_id).toBe(USER_A);
        expect(log.username).toBe("SpicyWolf");
        expect(log.channel_id).toBe(CHANNEL_A);
        expect(log.message_id).toBe(MESSAGE_A);
        expect(log.rule_type).toBe("BAD_WORD");
        expect(log.trigger_content).toBe("spam");
        expect(log.original_content).toBe("hello spam");
        expect(log.actions_taken).toEqual(["delete", "warn"]);
        expect(log.created_at).toEqual(new Date(createdAt));
    });

    it("falls back to an empty username when the user is unknown", async () => {
        await db.query(
            `INSERT INTO automod_logs (guild_id, user_id, rule_type, actions_taken)
             VALUES ($1::bigint, $2::bigint, 'SPAM', ARRAY['delete']::VARCHAR(50)[])`,
            [GUILD_A, USER_B]
        );

        const [log] = await getAutomodLogs(GUILD_A);

        expect(log.username).toBe("");
    });

    it("returns null channel and message ids when they are NULL", async () => {
        await db.query(
            `INSERT INTO automod_logs (guild_id, user_id, rule_type, actions_taken)
             VALUES ($1::bigint, $2::bigint, 'SPAM', ARRAY['delete']::VARCHAR(50)[])`,
            [GUILD_A, USER_A]
        );

        const [log] = await getAutomodLogs(GUILD_A);

        expect(log.channel_id).toBeNull();
        expect(log.message_id).toBeNull();
    });

    it("scopes logs to the guild", async () => {
        await db.query(
            `INSERT INTO automod_logs (guild_id, user_id, rule_type, actions_taken)
             VALUES ($1::bigint, $2::bigint, 'SPAM', ARRAY['delete']::VARCHAR(50)[]),
                    ($3::bigint, $2::bigint, 'SPAM', ARRAY['delete']::VARCHAR(50)[])`,
            [GUILD_A, USER_A, GUILD_B]
        );

        const rows = await getAutomodLogs(GUILD_A);

        expect(rows).toHaveLength(1);
        expect(rows[0].guild_id).toBe(GUILD_A);
    });

    it("orders by created_at desc then id desc", async () => {
        const at = "2026-01-01T00:00:00.000Z";
        await db.query(
            `INSERT INTO automod_logs (guild_id, user_id, rule_type, actions_taken, created_at)
             VALUES ($1::bigint, $2::bigint, 'SPAM', ARRAY['delete']::VARCHAR(50)[], $3::timestamptz),
                    ($1::bigint, $2::bigint, 'SPAM', ARRAY['delete']::VARCHAR(50)[], $3::timestamptz)`,
            [GUILD_A, USER_A, at]
        );

        const rows = await getAutomodLogs(GUILD_A);

        expect(rows).toHaveLength(2);
        expect(Number(rows[0].id)).toBeGreaterThan(Number(rows[1].id));
    });

    it("paginates with the created_at, id cursor", async () => {
        const timestamps = [
            "2026-01-03T00:00:00.000Z",
            "2026-01-02T00:00:00.000Z",
            "2026-01-01T00:00:00.000Z",
        ];
        for (const ts of timestamps) {
            await db.query(
                `INSERT INTO automod_logs (guild_id, user_id, rule_type, actions_taken, created_at)
                 VALUES ($1::bigint, $2::bigint, 'SPAM', ARRAY['delete']::VARCHAR(50)[], $3::timestamptz)`,
                [GUILD_A, USER_A, ts]
            );
        }

        const firstPage = await getAutomodLogs(GUILD_A, 2);
        expect(firstPage.map((r) => r.created_at.toISOString())).toEqual([
            "2026-01-03T00:00:00.000Z",
            "2026-01-02T00:00:00.000Z",
        ]);

        const cursorDate = firstPage[1].created_at;
        const cursorId = firstPage[1].id;
        const secondPage = await getAutomodLogs(GUILD_A, 2, cursorDate, cursorId);

        expect(secondPage.map((r) => r.created_at.toISOString())).toEqual([
            "2026-01-01T00:00:00.000Z",
        ]);
    });

    it("reads a stored empty actions_taken array as empty", async () => {
        await db.query(
            `INSERT INTO automod_logs (guild_id, user_id, rule_type, actions_taken)
             VALUES ($1::bigint, $2::bigint, 'SPAM', ARRAY[]::VARCHAR(50)[])`,
            [GUILD_A, USER_A]
        );

        const [log] = await getAutomodLogs(GUILD_A);

        expect(log.actions_taken).toEqual([]);
    });
});

describe("join leave logs against a real database", () => {
    it("returns an empty array for a guild with no logs", async () => {
        expect(await getJoinLeaveLogs(GUILD_A)).toEqual([]);
    });

    it("maps a JOIN row through the discord_users LEFT JOIN", async () => {
        await seedDiscordUser(USER_A, "Joiner");
        const createdAt = "2026-01-02T00:00:00.000Z";
        const { rows } = await db.query<{ id: string }>(
            `INSERT INTO join_leave_logs (user_id, guild_id, action, created_at)
             VALUES ($1::bigint, $2::bigint, 'JOIN'::LOG_ACTION, $3::timestamptz)
             RETURNING id`,
            [USER_A, GUILD_A, createdAt]
        );

        const [log] = await getJoinLeaveLogs(GUILD_A);

        expect(log.id).toBe(rows[0].id);
        expect(log.user_id).toBe(USER_A);
        expect(log.username).toBe("Joiner");
        expect(log.guild_id).toBe(GUILD_A);
        expect(log.action).toBe("JOIN");
        expect(log.created_at).toEqual(new Date(createdAt));
    });

    it("filters by the ::LOG_ACTION enum", async () => {
        const createdAt = "2026-01-02T00:00:00.000Z";
        await db.query(
            `INSERT INTO join_leave_logs (user_id, guild_id, action, created_at)
             VALUES ($1::bigint, $2::bigint, 'JOIN'::LOG_ACTION, $3::timestamptz),
                    ($4::bigint, $2::bigint, 'LEAVE'::LOG_ACTION, $3::timestamptz)`,
            [USER_A, GUILD_A, createdAt, USER_B]
        );

        const joins = await getJoinLeaveLogs(GUILD_A, "JOIN");
        const leaves = await getJoinLeaveLogs(GUILD_A, "LEAVE");

        expect(joins).toHaveLength(1);
        expect(joins[0].action).toBe("JOIN");
        expect(leaves).toHaveLength(1);
        expect(leaves[0].action).toBe("LEAVE");
    });

    it("falls back to an empty username when the user is unknown", async () => {
        await db.query(
            `INSERT INTO join_leave_logs (user_id, guild_id, action)
             VALUES ($1::bigint, $2::bigint, 'LEAVE'::LOG_ACTION)`,
            [USER_B, GUILD_A]
        );

        const [log] = await getJoinLeaveLogs(GUILD_A);

        expect(log.username).toBe("");
    });

    it("scopes logs to the guild", async () => {
        await db.query(
            `INSERT INTO join_leave_logs (user_id, guild_id, action)
             VALUES ($1::bigint, $2::bigint, 'JOIN'::LOG_ACTION),
                    ($1::bigint, $3::bigint, 'JOIN'::LOG_ACTION)`,
            [USER_A, GUILD_A, GUILD_B]
        );

        expect(await getJoinLeaveLogs(GUILD_A)).toHaveLength(1);
        expect(await getJoinLeaveLogs(GUILD_B)).toHaveLength(1);
    });

    it("orders by created_at desc then id desc", async () => {
        const at = "2026-01-01T00:00:00.000Z";
        await db.query(
            `INSERT INTO join_leave_logs (user_id, guild_id, action, created_at)
             VALUES ($1::bigint, $2::bigint, 'JOIN'::LOG_ACTION, $3::timestamptz),
                    ($1::bigint, $2::bigint, 'JOIN'::LOG_ACTION, $3::timestamptz)`,
            [USER_A, GUILD_A, at]
        );

        const rows = await getJoinLeaveLogs(GUILD_A);

        expect(rows).toHaveLength(2);
        expect(Number(rows[0].id)).toBeGreaterThan(Number(rows[1].id));
    });

    it("paginates with the created_at, id cursor", async () => {
        for (const ts of [
            "2026-01-03T00:00:00.000Z",
            "2026-01-02T00:00:00.000Z",
            "2026-01-01T00:00:00.000Z",
        ]) {
            await db.query(
                `INSERT INTO join_leave_logs (user_id, guild_id, action, created_at)
                 VALUES ($1::bigint, $2::bigint, 'JOIN'::LOG_ACTION, $3::timestamptz)`,
                [USER_A, GUILD_A, ts]
            );
        }

        const firstPage = await getJoinLeaveLogs(GUILD_A, null, 2);
        const secondPage = await getJoinLeaveLogs(
            GUILD_A,
            null,
            2,
            firstPage[1].created_at,
            firstPage[1].id
        );

        expect(secondPage.map((r) => r.created_at.toISOString())).toEqual([
            "2026-01-01T00:00:00.000Z",
        ]);
    });
});

describe("moderation logs against a real database", () => {
    async function seedModeration(overrides: {
        targetId?: string | null;
        moderatorId?: string;
        actionType?: string;
        reason?: string | null;
        duration?: string | null;
        createdAt?: string;
        guildId?: string;
    } = {}): Promise<{ caseId: string; createdAt: string }> {
        const guildId = overrides.guildId ?? GUILD_A;
        const targetId = overrides.targetId === undefined ? USER_B : overrides.targetId;
        const moderatorId = overrides.moderatorId ?? MOD_A;
        const actionType = overrides.actionType ?? "BAN";
        const reason = overrides.reason === undefined ? "Spam" : overrides.reason;
        const duration = overrides.duration === undefined ? null : overrides.duration;
        const createdAt = overrides.createdAt ?? "2026-01-02T00:00:00.000Z";

        const { rows } = await db.query<{ case_id: string }>(
            `INSERT INTO moderation_logs
                (guild_id, target_id, moderator_id, action_type, reason, duration, created_at)
             VALUES ($1::bigint, $2::bigint, $3::bigint, $4, $5, $6::interval, $7::timestamptz)
             RETURNING case_id`,
            [guildId, targetId, moderatorId, actionType, reason, duration, createdAt]
        );

        return { caseId: rows[0].case_id, createdAt };
    }

    it("returns an empty array for a guild with no logs", async () => {
        expect(await getModerationLogs(GUILD_A)).toEqual([]);
    });

    it("maps a row through both discord_users LEFT JOINs", async () => {
        await seedDiscordUser(USER_B, "Target");
        await seedDiscordUser(MOD_A, "Moderator");
        const { createdAt } = await seedModeration();

        const [log] = await getModerationLogs(GUILD_A);

        expect(log.case_id).toBeDefined();
        expect(log.guild_id).toBe(GUILD_A);
        expect(log.target_id).toBe(USER_B);
        expect(log.target_username).toBe("Target");
        expect(log.moderator_id).toBe(MOD_A);
        expect(log.moderator_username).toBe("Moderator");
        expect(log.action_type).toBe("BAN");
        expect(log.reason).toBe("Spam");
        expect(log.duration).toBeNull();
        expect(log.created_at).toEqual(new Date(createdAt));
    });

    it("falls back to empty usernames when users are unknown", async () => {
        await seedModeration({ targetId: null });

        const [log] = await getModerationLogs(GUILD_A);

        expect(log.target_id).toBeNull();
        expect(log.target_username).toBe("");
        expect(log.moderator_username).toBe("");
    });

    it("formats an interval duration", async () => {
        await seedModeration({ duration: "1 year 2 months 3 days 4 hours 5 minutes 6 seconds" });

        const [log] = await getModerationLogs(GUILD_A);

        expect(log.duration).toBe("1y 2mo 3d 4h 5m 6s");
    });

    it("returns null for a NULL duration", async () => {
        await seedModeration({ duration: null });

        const [log] = await getModerationLogs(GUILD_A);

        expect(log.duration).toBeNull();
    });

    it("scopes logs to the guild", async () => {
        await seedModeration({ guildId: GUILD_A });
        await seedModeration({ guildId: GUILD_B });

        expect(await getModerationLogs(GUILD_A)).toHaveLength(1);
        expect(await getModerationLogs(GUILD_B)).toHaveLength(1);
    });

    it("orders by created_at desc then case_id desc", async () => {
        const at = "2026-01-01T00:00:00.000Z";
        await seedModeration({ createdAt: at });
        await seedModeration({ createdAt: at });

        const rows = await getModerationLogs(GUILD_A);

        expect(rows).toHaveLength(2);
        expect(Number(rows[0].case_id)).toBeGreaterThan(Number(rows[1].case_id));
    });

    it("paginates with the created_at, case_id cursor", async () => {
        for (const ts of [
            "2026-01-03T00:00:00.000Z",
            "2026-01-02T00:00:00.000Z",
            "2026-01-01T00:00:00.000Z",
        ]) {
            await seedModeration({ createdAt: ts });
        }

        const firstPage = await getModerationLogs(GUILD_A, 2);
        const secondPage = await getModerationLogs(
            GUILD_A,
            2,
            firstPage[1].created_at,
            firstPage[1].case_id
        );

        expect(secondPage.map((r) => r.created_at.toISOString())).toEqual([
            "2026-01-01T00:00:00.000Z",
        ]);
    });

    it("omits zero interval units", async () => {
        await seedModeration({ duration: "1 day 2 hours" });

        const [log] = await getModerationLogs(GUILD_A);

        expect(log.duration).toBe("1d 2h");
    });

    it("returns all moderation logs without a duration column value as null reason", async () => {
        await seedModeration({ reason: null, duration: "2 hours" });

        const [log] = await getModerationLogs(GUILD_A);

        expect(log.reason).toBeNull();
        expect(log.duration).toBe("2h");
    });
});