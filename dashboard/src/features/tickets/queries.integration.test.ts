import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { getTicketConfig, getTicketHistory, getTicketList, saveTicketConfig } from "./queries";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";

// channel_id is the natural key: ticket_messages references tickets (channel_id),
// and the dashboard queries by channel rather than by the bigserial id.
const CHANNEL_1 = "111111111111111111";
const CHANNEL_2 = "222222222222222222";
const CHANNEL_3 = "333333333333333333";

async function seedTicket(options: {
    guildId: string;
    channelId: string;
    openerId?: string;
    status?: "OPEN" | "CLOSED";
    createdAt?: string;
    closedAt?: string | null;
    messageCount?: number;
}): Promise<void> {
    await db.query(
        `INSERT INTO tickets (guild_id, channel_id, opener_id, status, created_at, closed_at, last_activity, message_count)
         VALUES ($1::bigint, $2::bigint, $3::bigint, $4::TICKET_STATUS, $5::timestamptz,
                 $6::timestamptz, $5::timestamptz, $7)`,
        [
            options.guildId,
            options.channelId,
            options.openerId ?? "555555555555555555",
            options.status ?? "OPEN",
            options.createdAt ?? "2026-01-01T00:00:00Z",
            options.closedAt ?? null,
            options.messageCount ?? 0,
        ]
    );
}

async function seedTicketMessage(options: {
    channelId: string;
    messageId: string;
    authorId?: string;
    content?: string;
    createdAt?: string;
    isTicketManager?: boolean;
}): Promise<void> {
    await db.query(
        `INSERT INTO ticket_messages (ticket_channel_id, message_id, author_id, content, is_ticket_manager, created_at)
         VALUES ($1::bigint, $2::bigint, $3::bigint, $4, $5, $6::timestamptz)`,
        [
            options.channelId,
            options.messageId,
            options.authorId ?? "555555555555555555",
            options.content ?? "hello",
            options.isTicketManager ?? false,
            options.createdAt ?? "2026-01-01T00:00:00Z",
        ]
    );
}

describe("ticket history against a real database", () => {
    it("returns null for a channel with no ticket", async () => {
        expect(await getTicketHistory(GUILD_A, CHANNEL_1)).toBeNull();
    });

    it("returns an empty message list for a ticket with no messages", async () => {
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_1 });

        const history = await getTicketHistory(GUILD_A, CHANNEL_1);

        expect(history?.messages).toEqual([]);
    });

    // JSON_BUILD_OBJECT turns the timestamptz into a JSON string, so the schema's
    // z.coerce.date() is doing real work here. A Date in a mock would pass either way.
    it("coerces the JSON-serialised message timestamp back into a Date", async () => {
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_1 });
        await seedTicketMessage({
            channelId: CHANNEL_1,
            messageId: "900000000000000001",
            createdAt: "2026-03-04T05:06:07Z",
        });

        const history = await getTicketHistory(GUILD_A, CHANNEL_1);

        expect(history?.messages[0].created_at).toBeInstanceOf(Date);
        expect(history?.messages[0].created_at.toISOString()).toBe("2026-03-04T05:06:07.000Z");
    });

    it("orders messages oldest first", async () => {
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_1 });
        await seedTicketMessage({
            channelId: CHANNEL_1,
            messageId: "900000000000000002",
            content: "third",
            createdAt: "2026-01-03T00:00:00Z",
        });
        await seedTicketMessage({
            channelId: CHANNEL_1,
            messageId: "900000000000000001",
            content: "first",
            createdAt: "2026-01-01T00:00:00Z",
        });
        await seedTicketMessage({
            channelId: CHANNEL_1,
            messageId: "900000000000000003",
            content: "second",
            createdAt: "2026-01-02T00:00:00Z",
        });

        const history = await getTicketHistory(GUILD_A, CHANNEL_1);

        expect(history?.messages.map((m) => m.content)).toEqual(["first", "second", "third"]);
    });

    it("coerces the bigserial ticket_id into a number", async () => {
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_1 });

        // pg hands back int8 as a string, so TicketHistorySchema's z.coerce.number()
        // is what turns it into the number the type promises.
        const history = await getTicketHistory(GUILD_A, CHANNEL_1);

        expect(typeof history?.ticket_id).toBe("number");
        expect(history?.ticket_id).toBeGreaterThan(0);
    });

    it("returns the ticket's own snowflakes as strings", async () => {
        await seedTicket({
            guildId: GUILD_A,
            channelId: CHANNEL_1,
            openerId: "777777777777777777",
        });

        const history = await getTicketHistory(GUILD_A, CHANNEL_1);

        expect(history?.guild_id).toBe(GUILD_A);
        expect(history?.channel_id).toBe(CHANNEL_1);
        expect(history?.opener_id).toBe("777777777777777777");
    });

    it("carries a closed ticket's status and closed_at", async () => {
        await seedTicket({
            guildId: GUILD_A,
            channelId: CHANNEL_1,
            status: "CLOSED",
            createdAt: "2026-01-01T00:00:00Z",
            closedAt: "2026-01-05T00:00:00Z",
        });

        const history = await getTicketHistory(GUILD_A, CHANNEL_1);

        expect(history?.status).toBe("CLOSED");
        expect(history?.closed_at).toBeInstanceOf(Date);
        expect(history?.closed_at?.toISOString()).toBe("2026-01-05T00:00:00.000Z");
    });

    it("leaves closed_at null for an open ticket", async () => {
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_1, status: "OPEN" });

        expect((await getTicketHistory(GUILD_A, CHANNEL_1))?.closed_at).toBeNull();
    });

    it("marks a staff message as ticket manager", async () => {
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_1 });
        await seedTicketMessage({
            channelId: CHANNEL_1,
            messageId: "900000000000000004",
            isTicketManager: true,
        });

        const history = await getTicketHistory(GUILD_A, CHANNEL_1);

        expect(history?.messages[0].is_ticket_manager).toBe(true);
    });

    it("does not pull in another ticket's messages", async () => {
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_1 });
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_2 });
        await seedTicketMessage({
            channelId: CHANNEL_1,
            messageId: "900000000000000005",
            content: "mine",
        });
        await seedTicketMessage({
            channelId: CHANNEL_2,
            messageId: "900000000000000006",
            content: "theirs",
        });

        const history = await getTicketHistory(GUILD_A, CHANNEL_1);

        expect(history?.messages.map((m) => m.content)).toEqual(["mine"]);
    });

    it("preserves the stored message_count rather than recounting the messages", async () => {
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_1, messageCount: 7 });
        await seedTicketMessage({ channelId: CHANNEL_1, messageId: "900000000000000007" });

        const history = await getTicketHistory(GUILD_A, CHANNEL_1);

        expect(history?.message_count).toBe(7);
        expect(history?.messages).toHaveLength(1);
    });

    it("cascades a ticket delete onto its messages", async () => {
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_1 });
        await seedTicketMessage({ channelId: CHANNEL_1, messageId: "900000000000000008" });

        await db.query("DELETE FROM tickets WHERE channel_id = $1::bigint", [CHANNEL_1]);

        const { rows } = await db.query<{ count: number }>(
            "SELECT count(*)::int AS count FROM ticket_messages WHERE ticket_channel_id = $1::bigint",
            [CHANNEL_1]
        );
        expect(rows[0].count).toBe(0);
    });

    it("rejects a message_id already used by another ticket", async () => {
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_1 });
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_2 });
        await seedTicketMessage({ channelId: CHANNEL_1, messageId: "900000000000000009" });

        // message_id is UNIQUE across the whole table, not per ticket.
        await expect(
            seedTicketMessage({ channelId: CHANNEL_2, messageId: "900000000000000009" })
        ).rejects.toThrow(/duplicate key/);
    });
});

describe("ticket list against a real database", () => {
    it("returns an empty array for a guild with no tickets", async () => {
        expect(await getTicketList(GUILD_A)).toEqual([]);
    });

    it("coerces the bigserial id into a number", async () => {
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_1 });

        const [ticket] = await getTicketList(GUILD_A);

        expect(typeof ticket.id).toBe("number");
        expect(ticket.id).toBeGreaterThan(0);
    });

    it("orders newest first", async () => {
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_1, createdAt: "2026-01-01T00:00:00Z" });
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_2, createdAt: "2026-01-03T00:00:00Z" });
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_3, createdAt: "2026-01-02T00:00:00Z" });

        const tickets = await getTicketList(GUILD_A);

        expect(tickets.map((t) => t.channel_id)).toEqual([CHANNEL_2, CHANNEL_3, CHANNEL_1]);
    });

    it("scopes results to the guild", async () => {
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_1 });
        await seedTicket({ guildId: GUILD_B, channelId: CHANNEL_2 });

        expect(await getTicketList(GUILD_A)).toHaveLength(1);
        expect((await getTicketList(GUILD_A))[0].channel_id).toBe(CHANNEL_1);
    });

    it("returns both open and closed tickets", async () => {
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_1, status: "OPEN" });
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_2, status: "CLOSED" });

        const statuses = (await getTicketList(GUILD_A)).map((t) => t.status).sort();

        expect(statuses).toEqual(["CLOSED", "OPEN"]);
    });

    it("round-trips created_at and closed_at as Dates", async () => {
        await seedTicket({
            guildId: GUILD_A,
            channelId: CHANNEL_1,
            status: "CLOSED",
            createdAt: "2026-02-03T04:05:06Z",
            closedAt: "2026-02-04T05:06:07Z",
        });

        const [ticket] = await getTicketList(GUILD_A);

        expect(ticket.created_at).toBeInstanceOf(Date);
        expect(ticket.created_at.toISOString()).toBe("2026-02-03T04:05:06.000Z");
        expect(ticket.closed_at?.toISOString()).toBe("2026-02-04T05:06:07.000Z");
    });

    it("does not aggregate messages, which only the history query does", async () => {
        await seedTicket({ guildId: GUILD_A, channelId: CHANNEL_1 });
        await seedTicketMessage({ channelId: CHANNEL_1, messageId: "900000000000000010" });

        const [ticket] = await getTicketList(GUILD_A);

        expect(ticket).not.toHaveProperty("messages");
    });
});

describe("ticket config against a real database", () => {
    // These exercise the JSONB round trip in _shared/guild rather than tickets itself,
    // which is the part a mocked _shared/guild cannot show.
    it("returns defaults when the guild has no config row", async () => {
        const config = await getTicketConfig(GUILD_A);

        expect(config.enabled).toBe(false);
        expect(config.warnThreshold).toBe(30);
        expect(config.categoryId).toBeNull();
    });

    it("round-trips a saved config through the JSONB column", async () => {
        const saved = await getTicketConfig(GUILD_A);
        await saveTicketConfig(GUILD_A, {
            ...saved,
            enabled: true,
            categoryId: "999999999999999999",
            warnThreshold: 12,
        });

        const loaded = await getTicketConfig(GUILD_A);

        expect(loaded.enabled).toBe(true);
        expect(loaded.categoryId).toBe("999999999999999999");
        expect(loaded.warnThreshold).toBe(12);
    });

    it("preserves null rather than dropping the key", async () => {
        const saved = await getTicketConfig(GUILD_A);
        await saveTicketConfig(GUILD_A, { ...saved, categoryId: null, channelId: null });

        const { rows } = await db.query<{ settings: { tickets: Record<string, unknown> } }>(
            "SELECT settings FROM guild_configs WHERE guild_id = $1::bigint",
            [GUILD_A]
        );
        expect(rows[0].settings.tickets).toHaveProperty("categoryId", null);
        expect(rows[0].settings.tickets).toHaveProperty("channelId", null);
    });

    it("shallow-merges over a backend-written key", async () => {
        await db.query(
            `INSERT INTO guild_configs (guild_id, settings)
             VALUES ($1::bigint, $2::jsonb)`,
            [GUILD_A, JSON.stringify({ tickets: { category_id: "backend-only", enabled: false } })]
        );

        const saved = await getTicketConfig(GUILD_A);
        await saveTicketConfig(GUILD_A, { ...saved, enabled: true });

        const { rows } = await db.query<{ settings: { tickets: Record<string, unknown> } }>(
            "SELECT settings FROM guild_configs WHERE guild_id = $1::bigint",
            [GUILD_A]
        );
        expect(rows[0].settings.tickets.enabled).toBe(true);
        // saveGuildConfigField merges rather than replaces, so the bot's snake_case key survives.
        expect(rows[0].settings.tickets.category_id).toBe("backend-only");
    });

    it("keeps one guild's config out of another's", async () => {
        const saved = await getTicketConfig(GUILD_A);
        await saveTicketConfig(GUILD_A, { ...saved, categoryId: "111" });

        expect((await getTicketConfig(GUILD_B)).categoryId).toBeNull();
    });
});