import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getInitialReportsFromDb, getMoreReportsFromDb } from "./queries";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const CHANNEL_A = "111111111111111111";
const AUTHOR = "222222222222222222";
const REPORTER = "333333333333333333";
const MOD = "444444444444444444";

interface SeedReportOverrides {
    status?: string;
    content?: string;
    reason?: string;
    attachmentUrl?: string | null;
    moderatorId?: string | null;
    moderatorNotes?: string | null;
    resolvedAt?: string | null;
    authorId?: string;
    reporterId?: string;
    channelId?: string;
    messageDeleted?: boolean;
    userWarned?: boolean;
    userTimedOut?: boolean;
    userBanned?: boolean;
}

async function seedDiscordUser(userId: string, username: string): Promise<void> {
    await db.query(
        `INSERT INTO discord_users (user_id, username)
         VALUES ($1::bigint, $2)
         ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username`,
        [userId, username]
    );
}

async function seedReport(
    guildId: string,
    messageId: string,
    overrides: SeedReportOverrides = {}
): Promise<number> {
    const {
        status = "UNDER_REVIEW",
        content = "hello",
        reason = "spam",
        attachmentUrl = null,
        moderatorId = MOD,
        moderatorNotes = "notes",
        resolvedAt = "2026-01-02T00:00:00.000Z",
        authorId = AUTHOR,
        reporterId = REPORTER,
        channelId = CHANNEL_A,
        messageDeleted = false,
        userWarned = false,
        userTimedOut = false,
        userBanned = false,
    } = overrides;
    // pg returns BIGSERIAL as a string, so coerce to number here.
    const { rows } = await db.query<{ id: string }>(
        `INSERT INTO reported_messages
            (guild_id, channel_id, message_id, author_id, reporter_id, content, attachment_url, reason, status, moderator_id, moderator_notes, resolved_at, message_deleted, user_warned, user_timed_out, user_banned)
         VALUES ($1::bigint, $2::bigint, $3::bigint, $4::bigint, $5::bigint, $6, $7, $8, $9::REPORT_STATUS, $10, $11, $12::timestamptz, $13, $14, $15, $16)
         RETURNING id`,
        [
            guildId,
            channelId,
            messageId,
            authorId,
            reporterId,
            content,
            attachmentUrl,
            reason,
            status,
            moderatorId,
            moderatorNotes,
            resolvedAt,
            messageDeleted,
            userWarned,
            userTimedOut,
            userBanned,
        ]
    );
    return Number(rows[0].id);
}

describe("reported messages against a real database", () => {
    it("returns an empty array for a guild with no reports", async () => {
        expect(await getInitialReportsFromDb(GUILD_A)).toEqual([]);
    });

    it("maps a row through both discord_users LEFT JOINs", async () => {
        await seedDiscordUser(AUTHOR, "AuthorName");
        await seedDiscordUser(REPORTER, "ReporterName");
        const id = await seedReport(GUILD_A, "1000");

        const [report] = await getInitialReportsFromDb(GUILD_A);

        expect(report.id).toBe(id);
        expect(typeof report.id).toBe("number");
        expect(report.guild_id).toBe(GUILD_A);
        expect(report.channel_id).toBe(CHANNEL_A);
        expect(report.message_id).toBe("1000");
        expect(report.author_id).toBe(AUTHOR);
        expect(report.author_username).toBe("AuthorName");
        expect(report.reporter_id).toBe(REPORTER);
        expect(report.reporter_username).toBe("ReporterName");
        expect(report.content).toBe("hello");
        expect(report.attachment_url).toBeNull();
        expect(report.reason).toBe("spam");
        expect(report.status).toBe("UNDER_REVIEW");
        expect(report.moderator_id).toBe(MOD);
        expect(report.moderator_notes).toBe("notes");
        expect(report.created_at).toBeInstanceOf(Date);
        expect(report.resolved_at).toEqual(new Date("2026-01-02T00:00:00.000Z"));
        expect(report.message_deleted).toBe(false);
        expect(report.user_warned).toBe(false);
        expect(report.user_timed_out).toBe(false);
        expect(report.user_banned).toBe(false);
    });

    it("resolves each username JOIN independently", async () => {
        await seedDiscordUser(AUTHOR, "AuthorName");
        await seedReport(GUILD_A, "1002");

        const [authorOnly] = await getInitialReportsFromDb(GUILD_A);

        expect(authorOnly.author_username).toBe("AuthorName");
        expect(authorOnly.reporter_username).toBe("");
    });

    it("falls back to empty usernames for unknown users", async () => {
        await seedReport(GUILD_A, "1001");

        const [report] = await getInitialReportsFromDb(GUILD_A);

        expect(report.author_username).toBe("");
        expect(report.reporter_username).toBe("");
    });

    it("round-trips a stored attachment url", async () => {
        await seedReport(GUILD_A, "1003", { attachmentUrl: "https://cdn.example/img.png" });

        const [report] = await getInitialReportsFromDb(GUILD_A);

        expect(report.attachment_url).toBe("https://cdn.example/img.png");
    });

    it("maps null moderator fields and a null resolved_at", async () => {
        await seedReport(GUILD_A, "1004", {
            moderatorId: null,
            moderatorNotes: null,
            resolvedAt: null,
        });

        const [report] = await getInitialReportsFromDb(GUILD_A);

        expect(report.moderator_id).toBeNull();
        expect(report.moderator_notes).toBeNull();
        expect(report.resolved_at).toBeNull();
    });

    it.each(["ACTIONED", "DISMISSED"] as const)("round-trips status %s", async (status) => {
        await seedReport(GUILD_A, "1005", { status });

        const [report] = await getInitialReportsFromDb(GUILD_A);

        expect(report.status).toBe(status);
    });

    it("maps the moderation flags when all are set", async () => {
        await seedReport(GUILD_A, "1006", {
            messageDeleted: true,
            userWarned: true,
            userTimedOut: true,
            userBanned: true,
        });

        const [report] = await getInitialReportsFromDb(GUILD_A);

        expect(report.message_deleted).toBe(true);
        expect(report.user_warned).toBe(true);
        expect(report.user_timed_out).toBe(true);
        expect(report.user_banned).toBe(true);
    });

    it("scopes reports to the guild", async () => {
        await seedReport(GUILD_A, "2000");
        await seedReport(GUILD_B, "2001");

        expect(await getInitialReportsFromDb(GUILD_A)).toHaveLength(1);
        expect(await getInitialReportsFromDb(GUILD_B)).toHaveLength(1);
    });

    it("orders by id descending", async () => {
        await seedReport(GUILD_A, "3000");
        await seedReport(GUILD_A, "3001");

        const rows = await getInitialReportsFromDb(GUILD_A);

        expect(rows[0].id).toBeGreaterThan(rows[1].id);
    });

    it("limits the initial page to ten rows", async () => {
        for (let i = 0; i < 12; i++) {
            await seedReport(GUILD_A, String(4000 + i));
        }

        const initial = await getInitialReportsFromDb(GUILD_A);

        expect(initial).toHaveLength(10);
    });

    it("paginates with r.id < beforeId", async () => {
        for (let i = 0; i < 12; i++) {
            await seedReport(GUILD_A, String(5000 + i));
        }

        const initial = await getInitialReportsFromDb(GUILD_A);
        const smallestInitial = initial[initial.length - 1].id;

        const more = await getMoreReportsFromDb(GUILD_A, smallestInitial);

        expect(more).toHaveLength(2);
        expect(more.every((r) => r.id < smallestInitial)).toBe(true);
    });

    it("excludes the cursor row itself from the next page", async () => {
        const firstId = await seedReport(GUILD_A, "5100");
        const secondId = await seedReport(GUILD_A, "5101");

        const more = await getMoreReportsFromDb(GUILD_A, secondId);

        expect(more).toHaveLength(1);
        expect(more[0].id).toBe(firstId);
    });

    it("scopes the next page to the guild", async () => {
        await seedReport(GUILD_A, "5200");
        await seedReport(GUILD_B, "5201");

        const more = await getMoreReportsFromDb(GUILD_A, 1_000_000);

        expect(more).toHaveLength(1);
        expect(more[0].guild_id).toBe(GUILD_A);
    });

    it("orders the next page by id descending", async () => {
        for (let i = 0; i < 3; i++) {
            await seedReport(GUILD_A, String(5300 + i));
        }

        const more = await getMoreReportsFromDb(GUILD_A, 1_000_000);

        expect(more.map((r) => r.id)).toEqual([...more.map((r) => r.id)].sort((a, b) => b - a));
    });

    it("limits the next page to ten rows", async () => {
        for (let i = 0; i < 22; i++) {
            await seedReport(GUILD_A, String(5400 + i));
        }

        const initial = await getInitialReportsFromDb(GUILD_A);
        const more = await getMoreReportsFromDb(GUILD_A, initial[initial.length - 1].id);

        expect(more).toHaveLength(10);
    });

    it("returns an empty array when no more rows exist", async () => {
        await seedReport(GUILD_A, "6000");

        const initial = await getInitialReportsFromDb(GUILD_A);
        const lastId = initial[initial.length - 1].id;

        const more = await getMoreReportsFromDb(GUILD_A, lastId);

        expect(more).toEqual([]);
    });

    it("rejects a second report of the same message by the same reporter", async () => {
        await seedReport(GUILD_A, "7000");

        await expect(seedReport(GUILD_A, "7000")).rejects.toThrow(
            /unique_user_report_per_message/
        );
    });

    it("allows a different reporter on the same message", async () => {
        await seedReport(GUILD_A, "7001");
        await seedReport(GUILD_A, "7001", { reporterId: "555555555555555555" });

        expect(await getInitialReportsFromDb(GUILD_A)).toHaveLength(2);
    });
});
