import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
    fetchMoreDeletedMessages,
    fetchMoreEditedMessages,
    getDeletedMessagesHistory,
    getEditedMessagesHistory,
} from "./queries";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";
const CHANNEL_A = "111111111111111111";
const AUTHOR = "222222222222222222";
const DELETER = "333333333333333333";

interface SeedEditedOverrides {
    authorId?: string;
    oldContent?: string | null;
    newContent?: string | null;
}

interface SeedDeletedOverrides {
    authorId?: string;
    deletedById?: string | null;
    content?: string;
    attachmentUrl?: string | null;
    deletedAt?: string | null;
}

async function seedDiscordUser(userId: string, username: string): Promise<void> {
    await db.query(
        `INSERT INTO discord_users (user_id, username)
         VALUES ($1::bigint, $2)
         ON CONFLICT (user_id) DO UPDATE SET username = EXCLUDED.username`,
        [userId, username]
    );
}

async function seedEdited(
    guildId: string,
    messageId: string,
    overrides: SeedEditedOverrides = {}
): Promise<number> {
    const { authorId = AUTHOR, oldContent = "before", newContent = "after" } = overrides;
    // pg returns BIGSERIAL as a string, so coerce to number here.
    const { rows } = await db.query<{ id: string }>(
        `INSERT INTO modified_messages (guild_id, channel_id, message_id, author_id, old_content, new_content)
         VALUES ($1::bigint, $2::bigint, $3::bigint, $4::bigint, $5, $6)
         RETURNING id`,
        [guildId, CHANNEL_A, messageId, authorId, oldContent, newContent]
    );
    return Number(rows[0].id);
}

async function seedDeleted(
    guildId: string,
    messageId: string,
    overrides: SeedDeletedOverrides = {}
): Promise<number> {
    const {
        authorId = AUTHOR,
        deletedById = null,
        content = "hello",
        attachmentUrl = null,
        deletedAt = "2026-01-02T00:00:00.000Z",
    } = overrides;
    const { rows } = await db.query<{ id: string }>(
        `INSERT INTO deleted_messages (guild_id, channel_id, message_id, author_id, deleted_by_id, content, attachment_url, deleted_at)
         VALUES ($1::bigint, $2::bigint, $3::bigint, $4::bigint, $5::bigint, $6, $7, $8::timestamptz)
         RETURNING id`,
        [guildId, CHANNEL_A, messageId, authorId, deletedById, content, attachmentUrl, deletedAt]
    );
    return Number(rows[0].id);
}

describe("edited messages against a real database", () => {
    it("returns an empty array for a guild with no edits", async () => {
        expect(await getEditedMessagesHistory(GUILD_A)).toEqual([]);
    });

    it("maps a row through the discord_users LEFT JOIN", async () => {
        await seedDiscordUser(AUTHOR, "AuthorName");
        const id = await seedEdited(GUILD_A, "1000");

        const [row] = await getEditedMessagesHistory(GUILD_A);

        expect(row.id).toBe(id);
        expect(typeof row.id).toBe("number");
        expect(row.guild_id).toBe(GUILD_A);
        expect(row.channel_id).toBe(CHANNEL_A);
        expect(row.message_id).toBe("1000");
        expect(row.author_id).toBe(AUTHOR);
        expect(row.author_username).toBe("AuthorName");
        expect(row.old_content).toBe("before");
        expect(row.new_content).toBe("after");
        expect(row.updated_at).toBeInstanceOf(Date);
    });

    it("falls back to an empty username for an unknown author", async () => {
        await seedEdited(GUILD_A, "1001");

        const [row] = await getEditedMessagesHistory(GUILD_A);

        expect(row.author_username).toBe("");
    });

    it("maps null contents", async () => {
        await seedEdited(GUILD_A, "1002", { oldContent: null, newContent: null });

        const [row] = await getEditedMessagesHistory(GUILD_A);

        expect(row.old_content).toBeNull();
        expect(row.new_content).toBeNull();
    });

    it("scopes edits to the guild", async () => {
        await seedEdited(GUILD_A, "2000");
        await seedEdited(GUILD_B, "2001");

        expect(await getEditedMessagesHistory(GUILD_A)).toHaveLength(1);
        expect(await getEditedMessagesHistory(GUILD_B)).toHaveLength(1);
    });

    it("orders by id descending", async () => {
        await seedEdited(GUILD_A, "3000");
        await seedEdited(GUILD_A, "3001");

        const rows = await getEditedMessagesHistory(GUILD_A);

        expect(rows[0].id).toBeGreaterThan(rows[1].id);
    });

    it("limits the initial page to ten rows", async () => {
        for (let i = 0; i < 12; i++) {
            await seedEdited(GUILD_A, String(4000 + i));
        }

        expect(await getEditedMessagesHistory(GUILD_A)).toHaveLength(10);
    });

    it("paginates with m.id < beforeId", async () => {
        for (let i = 0; i < 12; i++) {
            await seedEdited(GUILD_A, String(5000 + i));
        }

        const initial = await getEditedMessagesHistory(GUILD_A);
        const smallestInitial = initial[initial.length - 1].id;

        const more = await fetchMoreEditedMessages(GUILD_A, smallestInitial);

        expect(more).toHaveLength(2);
        expect(more.every((r) => r.id < smallestInitial)).toBe(true);
    });

    it("returns an empty array when no more edits exist", async () => {
        await seedEdited(GUILD_A, "6000");

        const initial = await getEditedMessagesHistory(GUILD_A);
        const more = await fetchMoreEditedMessages(GUILD_A, initial[initial.length - 1].id);

        expect(more).toEqual([]);
    });
});

describe("deleted messages against a real database", () => {
    it("returns an empty array for a guild with no deletions", async () => {
        expect(await getDeletedMessagesHistory(GUILD_A)).toEqual([]);
    });

    it("maps a row through both discord_users LEFT JOINs", async () => {
        await seedDiscordUser(AUTHOR, "AuthorName");
        await seedDiscordUser(DELETER, "DeleterName");
        const id = await seedDeleted(GUILD_A, "7000", {
            deletedById: DELETER,
            attachmentUrl: "https://cdn.example/x.png",
        });

        const [row] = await getDeletedMessagesHistory(GUILD_A);

        expect(row.id).toBe(id);
        expect(typeof row.id).toBe("number");
        expect(row.guild_id).toBe(GUILD_A);
        expect(row.channel_id).toBe(CHANNEL_A);
        expect(row.message_id).toBe("7000");
        expect(row.author_id).toBe(AUTHOR);
        expect(row.author_username).toBe("AuthorName");
        expect(row.deleted_by_id).toBe(DELETER);
        expect(row.deleted_by_username).toBe("DeleterName");
        expect(row.content).toBe("hello");
        expect(row.attachment_url).toBe("https://cdn.example/x.png");
        expect(row.deleted_at).toEqual(new Date("2026-01-02T00:00:00.000Z"));
    });

    it("resolves each username JOIN independently", async () => {
        await seedDiscordUser(AUTHOR, "AuthorName");
        await seedDeleted(GUILD_A, "7001", { deletedById: DELETER });

        const [row] = await getDeletedMessagesHistory(GUILD_A);

        expect(row.author_username).toBe("AuthorName");
        expect(row.deleted_by_username).toBe("");
    });

    it("falls back to empty usernames for unknown users", async () => {
        await seedDeleted(GUILD_A, "7002", { deletedById: DELETER });

        const [row] = await getDeletedMessagesHistory(GUILD_A);

        expect(row.author_username).toBe("");
        expect(row.deleted_by_username).toBe("");
    });

    it("maps a null deleter", async () => {
        await seedDeleted(GUILD_A, "7003", { deletedById: null });

        const [row] = await getDeletedMessagesHistory(GUILD_A);

        expect(row.deleted_by_id).toBeNull();
        expect(row.deleted_by_username).toBe("");
    });

    it("scopes deletions to the guild", async () => {
        await seedDeleted(GUILD_A, "8000");
        await seedDeleted(GUILD_B, "8001");

        expect(await getDeletedMessagesHistory(GUILD_A)).toHaveLength(1);
        expect(await getDeletedMessagesHistory(GUILD_B)).toHaveLength(1);
    });

    it("orders the first page by deleted_at descending", async () => {
        await seedDeleted(GUILD_A, "9000", { deletedAt: "2026-01-01T00:00:00Z" });
        await seedDeleted(GUILD_A, "9001", { deletedAt: "2026-01-03T00:00:00Z" });
        await seedDeleted(GUILD_A, "9002", { deletedAt: "2026-01-02T00:00:00Z" });

        const rows = await getDeletedMessagesHistory(GUILD_A);

        expect(rows.map((r) => r.message_id)).toEqual(["9001", "9002", "9000"]);
    });

    it("orders later pages by id descending", async () => {
        // deleted_at runs opposite to id order here, so id ordering is observable.
        await seedDeleted(GUILD_A, "9100", { deletedAt: "2026-01-03T00:00:00Z" });
        await seedDeleted(GUILD_A, "9101", { deletedAt: "2026-01-02T00:00:00Z" });
        await seedDeleted(GUILD_A, "9102", { deletedAt: "2026-01-01T00:00:00Z" });

        const more = await fetchMoreDeletedMessages(GUILD_A, 1_000_000);

        expect(more.map((r) => r.message_id)).toEqual(["9102", "9101", "9100"]);
    });

    it("pages on id while the first page sorts on deleted_at", async () => {
        await seedDeleted(GUILD_A, "9200", { deletedAt: "2026-01-03T00:00:00Z" });
        await seedDeleted(GUILD_A, "9201", { deletedAt: "2026-01-01T00:00:00Z" });
        await seedDeleted(GUILD_A, "9202", { deletedAt: "2026-01-02T00:00:00Z" });

        const initial = await getDeletedMessagesHistory(GUILD_A);
        expect(initial.map((r) => r.message_id)).toEqual(["9200", "9202", "9201"]);

        // The cursor filters on id, so the first page head appears again.
        const more = await fetchMoreDeletedMessages(GUILD_A, initial[initial.length - 1].id);

        expect(more.map((r) => r.message_id)).toEqual(["9200"]);
    });

    it("limits the initial page to fifty rows", async () => {
        for (let i = 0; i < 52; i++) {
            await seedDeleted(GUILD_A, String(9300 + i));
        }

        expect(await getDeletedMessagesHistory(GUILD_A)).toHaveLength(50);
    });

    it("limits later pages to ten rows", async () => {
        for (let i = 0; i < 62; i++) {
            await seedDeleted(GUILD_A, String(9400 + i));
        }

        const initial = await getDeletedMessagesHistory(GUILD_A);
        const more = await fetchMoreDeletedMessages(GUILD_A, initial[initial.length - 1].id);

        expect(more).toHaveLength(10);
    });

    it("returns an empty array when no more deletions exist", async () => {
        await seedDeleted(GUILD_A, "9500");

        const initial = await getDeletedMessagesHistory(GUILD_A);
        const more = await fetchMoreDeletedMessages(GUILD_A, initial[initial.length - 1].id);

        expect(more).toEqual([]);
    });
});
