import { describe, it, expect } from "vitest";
import { db } from "@/lib/db";
import { economyItemSchema, type EconomyItem, type EconomyWorkMessage } from "./types";
import {
    deleteEconomyCategory,
    deleteEconomyItem,
    deleteEconomyWorkMessage,
    fetchMoreEconomyLeaderboard,
    getEconomyCategories,
    getEconomyItem,
    getEconomyItems,
    getEconomyLeaderboard,
    getEconomyWorkMessages,
    saveEconomyCategory,
    saveEconomyItem,
    saveEconomyWorkMessage,
    syncEconomyWorkMessages,
} from "./queries";

const GUILD_A = "123456789012345678";
const GUILD_B = "987654321098765432";

// The schemas mark id optional, but a saved row always comes back with one.
type SeededMessage = EconomyWorkMessage & { id: string };
type SeededItem = EconomyItem & { id: string };

async function seedMessage(guildId: string, content: string, id?: string): Promise<SeededMessage> {
    const saved = await saveEconomyWorkMessage(guildId, id !== undefined ? { id, content } : { content });
    if (saved.id === undefined) throw new Error("saveEconomyWorkMessage returned no id");
    return { ...saved, id: saved.id };
}

async function seedItem(guildId: string, overrides: Record<string, unknown> = {}): Promise<SeededItem> {
    const saved = await saveEconomyItem(guildId, economyItemSchema.parse({ name: "Sword", ...overrides }));
    if (saved.id === undefined) throw new Error("saveEconomyItem returned no id");
    return { ...saved, id: saved.id };
}

async function seedCategory(guildId: string, name: string): Promise<string> {
    const saved = await saveEconomyCategory(guildId, { name });
    if (saved.id === undefined) throw new Error("saveEconomyCategory returned no id");
    return saved.id;
}

// Balances and usernames have no dashboard query of their own, so the leaderboard
// tests plant them straight into the tables the query joins against.
async function seedBalance(guildId: string, userId: string, cash: number, bank: number): Promise<void> {
    await db.query(
        "INSERT INTO economy_balances (guild_id, user_id, cash, bank) VALUES ($1::bigint, $2::bigint, $3::bigint, $4::bigint)",
        [guildId, userId, cash, bank]
    );
}

async function seedDiscordUser(userId: string, username: string): Promise<void> {
    await db.query("INSERT INTO discord_users (user_id, username) VALUES ($1::bigint, $2)", [
        userId,
        username,
    ]);
}

describe("economy items against a real database", () => {
    describe("saveEconomyItem", () => {
        it("stores a custom emoji in emoji_id and leaves unicode null", async () => {
            const saved = await seedItem(GUILD_A, { emoji: "<:item:987654321>" });

            const { rows } = await db.query<{ emoji_unicode: string | null; emoji_id: string | null }>(
                "SELECT emoji_unicode, emoji_id FROM economy_items WHERE id = $1::uuid",
                [saved.id]
            );
            expect(rows[0]).toEqual({ emoji_unicode: null, emoji_id: "987654321" });
        });

        it("stores a unicode emoji and leaves emoji_id null", async () => {
            await seedItem(GUILD_A, { emoji: "⚔️" });

            const { rows } = await db.query<{ emoji_unicode: string | null; emoji_id: string | null }>(
                "SELECT emoji_unicode, emoji_id FROM economy_items WHERE name = 'Sword'"
            );
            expect(rows[0]).toEqual({ emoji_unicode: "⚔️", emoji_id: null });
        });

        it("trims whitespace off a unicode emoji before storing it", async () => {
            await seedItem(GUILD_A, { emoji: "  ⚔️  " });

            const { rows } = await db.query<{ emoji_unicode: string | null }>(
                "SELECT emoji_unicode FROM economy_items WHERE name = 'Sword'"
            );
            expect(rows[0].emoji_unicode).toBe("⚔️");
        });

        it("stores nulls for both emoji columns when the emoji is whitespace only", async () => {
            await seedItem(GUILD_A, { emoji: "   " });

            const { rows } = await db.query<{ emoji_unicode: string | null; emoji_id: string | null }>(
                "SELECT emoji_unicode, emoji_id FROM economy_items WHERE name = 'Sword'"
            );
            expect(rows[0]).toEqual({ emoji_unicode: null, emoji_id: null });
        });

        it.each([
            ["an unterminated custom emoji", "<:item:987"],
            ["a missing closing bracket", "<a:b"],
            ["a bracketed emoji with no third segment", "<a:b>"],
            ["a colon-separated string that is not bracket-wrapped", "a:b:c>"],
        ])("keeps %s as unicode rather than reading an id", async (_label, emoji) => {
            await seedItem(GUILD_A, { emoji });

            const { rows } = await db.query<{ emoji_unicode: string | null; emoji_id: string | null }>(
                "SELECT emoji_unicode, emoji_id FROM economy_items WHERE name = 'Sword'"
            );
            expect(rows[0]).toEqual({ emoji_unicode: emoji, emoji_id: null });
        });

        it("writes a null category as SQL NULL", async () => {
            const saved = await seedItem(GUILD_A, { category: null });

            const { rows } = await db.query<{ category_id: string | null }>(
                "SELECT category_id FROM economy_items WHERE id = $1::uuid",
                [saved.id]
            );
            expect(rows[0].category_id).toBeNull();
        });

        it("rejects a category belonging to another guild", async () => {
            // The FK is (guild_id, category_id), so cross-tenant categories cannot attach.
            const foreignId = await seedCategory(GUILD_B, "Theirs");

            await expect(seedItem(GUILD_A, { category: foreignId })).rejects.toThrow(
                /fk_economy_items_category/
            );
        });

        it("forces stock to zero for an unlimited item", async () => {
            const saved = await seedItem(GUILD_A, { unlimitedStock: true, stockRemaining: 42 });

            const { rows } = await db.query<{ stock_remaining: number }>(
                "SELECT stock_remaining FROM economy_items WHERE id = $1::uuid",
                [saved.id]
            );
            expect(rows[0].stock_remaining).toBe(0);
        });

        it("keeps the stored stock for a limited item", async () => {
            const saved = await seedItem(GUILD_A, { unlimitedStock: false, stockRemaining: 42 });

            const { rows } = await db.query<{ stock_remaining: number }>(
                "SELECT stock_remaining FROM economy_items WHERE id = $1::uuid",
                [saved.id]
            );
            expect(rows[0].stock_remaining).toBe(42);
        });

        it("round-trips requirements and actions through the JSONB columns", async () => {
            const saved = await seedItem(GUILD_A, {
                requirements: [{ type: "ROLE", roleIds: ["role_a"] }],
                actions: [{ type: "ADD_BALANCE", balance: 100 }],
            });

            const { rows } = await db.query<{ requirements: unknown; actions: unknown }>(
                "SELECT requirements, actions FROM economy_items WHERE id = $1::uuid",
                [saved.id]
            );
            expect(rows[0].requirements).toEqual([{ type: "ROLE", matchType: "EVERY", triggerFlags: 1, roleIds: ["role_a"] }]);
            expect(rows[0].actions).toEqual([{ type: "ADD_BALANCE", triggerFlags: 1, balance: 100 }]);

            const [reloaded] = await getEconomyItems(GUILD_A);
            expect(reloaded.requirements).toEqual(rows[0].requirements);
            expect(reloaded.actions).toEqual(rows[0].actions);
        });

        it("rejects a negative price, which the migration forbids", async () => {
            // Zod already blocks this, so the CHECK is the second line of defence.
            await expect(
                db.query("INSERT INTO economy_items (guild_id, name, price) VALUES ($1::bigint, 'Free', -1::bigint)", [
                    GUILD_A,
                ])
            ).rejects.toThrow(/chk_economy_items_price_non_negative/);
        });

        it("rejects negative stock, which the migration forbids", async () => {
            await expect(
                db.query(
                    "INSERT INTO economy_items (guild_id, name, stock_remaining) VALUES ($1::bigint, 'Ghost', -1)",
                    [GUILD_A]
                )
            ).rejects.toThrow(/chk_economy_items_stock_non_negative/);
        });
    });

    describe("getEconomyItems", () => {
        it("returns only the guild's items, ordered by name", async () => {
            await seedItem(GUILD_A, { name: "Zebra" });
            await seedItem(GUILD_A, { name: "Apple" });
            await seedItem(GUILD_B, { name: "Other guild" });

            const items = await getEconomyItems(GUILD_A);

            expect(items.map((i) => i.name)).toEqual(["Apple", "Zebra"]);
        });

        it("hides items whose expires_at has passed", async () => {
            await seedItem(GUILD_A, { name: "Live" });
            await seedItem(GUILD_A, { name: "Expired" });
            await seedItem(GUILD_A, { name: "Future" });
            await db.query(
                "UPDATE economy_items SET expires_at = '2020-01-01T00:00:00Z' WHERE name = 'Expired'"
            );
            await db.query(
                "UPDATE economy_items SET expires_at = '2999-01-01T00:00:00Z' WHERE name = 'Future'"
            );

            const items = await getEconomyItems(GUILD_A);

            expect(items.map((i) => i.name)).toEqual(["Future", "Live"]);
        });

        it("coerces a bigint price into a number", async () => {
            const saved = await seedItem(GUILD_A, { price: 900 });
            // pg returns int8 as a string, so this proves the coercion in mapRowToItem.
            const { rows } = await db.query<{ price: string }>(
                "SELECT price FROM economy_items WHERE id = $1::uuid",
                [saved.id]
            );
            expect(typeof rows[0].price).toBe("string");

            expect((await getEconomyItems(GUILD_A))[0].price).toBe(900);
        });

        it("prefers emoji_id over emoji_unicode when both are stored", async () => {
            await db.query(
                `INSERT INTO economy_items (guild_id, name, emoji_id, emoji_unicode)
                 VALUES ($1::bigint, 'Both', '987654321', '⚔️')`,
                [GUILD_A]
            );

            expect((await getEconomyItems(GUILD_A))[0].emoji).toBe("<:item:987654321>");
        });

        it("falls back to unicode when emoji_id is an empty string", async () => {
            await db.query(
                `INSERT INTO economy_items (guild_id, name, emoji_id, emoji_unicode)
                 VALUES ($1::bigint, 'Blank', '', '⚔️')`,
                [GUILD_A]
            );

            expect((await getEconomyItems(GUILD_A))[0].emoji).toBe("⚔️");
        });

        it("leaves emoji undefined when neither column is populated", async () => {
            await seedItem(GUILD_A, { name: "Bare" });

            expect((await getEconomyItems(GUILD_A))[0].emoji).toBeUndefined();
        });

        it("reports zero stock for an unlimited item even when the column has a value", async () => {
            await db.query(
                `INSERT INTO economy_items (guild_id, name, unlimited_stock, stock_remaining)
                 VALUES ($1::bigint, 'Infinite', TRUE, 99)`,
                [GUILD_A]
            );

            expect((await getEconomyItems(GUILD_A))[0].stockRemaining).toBe(0);
        });

        it("maps the boolean item flags through untouched", async () => {
            await db.query(
                `INSERT INTO economy_items (guild_id, name, is_inventory, is_usable, is_sellable, is_listed)
                 VALUES ($1::bigint, 'Flags', FALSE, TRUE, TRUE, FALSE)`,
                [GUILD_A]
            );

            expect((await getEconomyItems(GUILD_A))[0]).toMatchObject({
                isInventory: false,
                isUsable: true,
                isSellable: true,
                isListed: false,
            });
        });
    });

    describe("getEconomyItem", () => {
        it("returns null for a missing item", async () => {
            expect(await getEconomyItem(GUILD_A, "11111111-1111-4111-8111-111111111111")).toBeNull();
        });

        it("refuses to read an item belonging to another guild", async () => {
            const foreign = await seedItem(GUILD_B, { name: "Theirs" });

            expect(await getEconomyItem(GUILD_A, foreign.id)).toBeNull();
        });
    });

    describe("deleteEconomyItem", () => {
        it("deletes the item and reports success", async () => {
            const saved = await seedItem(GUILD_A);

            expect(await deleteEconomyItem(GUILD_A, saved.id)).toBe(true);
            expect(await getEconomyItems(GUILD_A)).toHaveLength(0);
        });

        it("refuses to delete an item belonging to another guild", async () => {
            const foreign = await seedItem(GUILD_B, { name: "Theirs" });

            expect(await deleteEconomyItem(GUILD_A, foreign.id)).toBe(false);
            expect(await getEconomyItems(GUILD_B)).toHaveLength(1);
        });
    });
});

describe("economy categories against a real database", () => {
    it("returns only the guild's categories, ordered by name", async () => {
        await saveEconomyCategory(GUILD_A, { name: "Weapons" });
        await saveEconomyCategory(GUILD_A, { name: "Armour" });
        await saveEconomyCategory(GUILD_B, { name: "Other guild" });

        const categories = await getEconomyCategories(GUILD_A);

        expect(categories.map((c) => c.name)).toEqual(["Armour", "Weapons"]);
    });

    it("generates a uuid when the category has no id", async () => {
        const saved = await saveEconomyCategory(GUILD_A, { name: "Weapons" });

        expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it("updates in place when the id already exists", async () => {
        const first = await saveEconomyCategory(GUILD_A, { name: "Weapons" });
        const second = await saveEconomyCategory(GUILD_A, { id: first.id, name: "Armour" });

        expect(second.id).toBe(first.id);
        expect((await getEconomyCategories(GUILD_A)).map((c) => c.name)).toEqual(["Armour"]);
    });

    it("rejects a duplicate name within the same guild", async () => {
        await saveEconomyCategory(GUILD_A, { name: "Weapons" });

        await expect(saveEconomyCategory(GUILD_A, { name: "Weapons" })).rejects.toThrow(
            /uq_economy_categories_guild_name/
        );
    });

    it("allows the same name in a different guild", async () => {
        await saveEconomyCategory(GUILD_A, { name: "Weapons" });
        await saveEconomyCategory(GUILD_B, { name: "Weapons" });

        expect(await getEconomyCategories(GUILD_A)).toHaveLength(1);
        expect(await getEconomyCategories(GUILD_B)).toHaveLength(1);
    });

    it("deletes the category and reports success", async () => {
        const id = await seedCategory(GUILD_A, "Weapons");

        expect(await deleteEconomyCategory(GUILD_A, id)).toBe(true);
        expect(await getEconomyCategories(GUILD_A)).toHaveLength(0);
    });

    it("refuses to delete a category belonging to another guild", async () => {
        const foreignId = await seedCategory(GUILD_B, "Theirs");

        expect(await deleteEconomyCategory(GUILD_A, foreignId)).toBe(false);
        expect(await getEconomyCategories(GUILD_B)).toHaveLength(1);
    });
});

describe("economy leaderboard against a real database", () => {
    it("orders by total descending, breaking ties on the lower user id", async () => {
        await seedBalance(GUILD_A, "300", 50, 50);
        await seedBalance(GUILD_A, "100", 100, 0);
        await seedBalance(GUILD_A, "200", 100, 0);

        const entries = await getEconomyLeaderboard(GUILD_A);

        expect(entries.map((e) => e.userId)).toEqual(["100", "200", "300"]);
        expect(entries.map((e) => e.total)).toEqual([100, 100, 100]);
    });

    it("paginates with LIMIT and OFFSET", async () => {
        await seedBalance(GUILD_A, "100", 300, 0);
        await seedBalance(GUILD_A, "200", 200, 0);
        await seedBalance(GUILD_A, "300", 100, 0);

        expect((await getEconomyLeaderboard(GUILD_A, 2, 0)).map((e) => e.userId)).toEqual(["100", "200"]);
        expect((await getEconomyLeaderboard(GUILD_A, 2, 2)).map((e) => e.userId)).toEqual(["300"]);
    });

    it("scopes results to the guild", async () => {
        await seedBalance(GUILD_A, "100", 300, 0);
        await seedBalance(GUILD_B, "200", 900, 0);

        expect(await getEconomyLeaderboard(GUILD_A)).toHaveLength(1);
    });

    it("joins the username, defaulting to empty when the user is unknown", async () => {
        await seedBalance(GUILD_A, "100", 10, 0);
        await seedBalance(GUILD_A, "200", 5, 0);
        await seedDiscordUser("100", "alpha");

        const entries = await getEconomyLeaderboard(GUILD_A);

        expect(entries[0].username).toBe("alpha");
        expect(entries[1].username).toBe("");
    });

    it("returns only totals strictly below the cursor", async () => {
        await seedBalance(GUILD_A, "100", 300, 0);
        await seedBalance(GUILD_A, "200", 200, 0);
        await seedBalance(GUILD_A, "300", 100, 0);

        const entries = await fetchMoreEconomyLeaderboard(GUILD_A, 300);

        expect(entries.map((e) => e.userId)).toEqual(["200", "300"]);
    });

    it("rejects an out-of-range limit before querying", async () => {
        await expect(getEconomyLeaderboard(GUILD_A, 101, 0)).rejects.toThrow();
    });

    it("rejects a negative offset before querying", async () => {
        await expect(getEconomyLeaderboard(GUILD_A, 20, -1)).rejects.toThrow();
    });

    // cash and bank are BIGINT but the query casts them to ::int, so a balance
    // past 2_147_483_647 aborts the whole leaderboard rather than clamping.
    it("throws when a balance exceeds the int32 range", async () => {
        await seedBalance(GUILD_A, "100", 3_000_000_000, 0);

        await expect(getEconomyLeaderboard(GUILD_A)).rejects.toThrow(/out of range/);
    });
});

describe("economy work messages against a real database", () => {
    describe("saveEconomyWorkMessage", () => {
        it("stores the guild snowflake as a bigint and reads it back", async () => {
            const saved = await seedMessage(GUILD_A, "Work, {user}!");

            expect(saved.id).toMatch(/^[0-9a-f-]{36}$/);

            const { rows } = await db.query<{ guild_id: string; content: string }>(
                "SELECT guild_id::text, content FROM economy_work_messages WHERE id = $1::uuid",
                [saved.id]
            );
            expect(rows[0].guild_id).toBe(GUILD_A);
            expect(rows[0].content).toBe("Work, {user}!");
        });

        it("updates in place when the id already exists", async () => {
            const first = await seedMessage(GUILD_A, "first");
            const second = await saveEconomyWorkMessage(GUILD_A, { id: first.id, content: "second" });

            expect(second.id).toBe(first.id);

            const messages = await getEconomyWorkMessages(GUILD_A);
            expect(messages).toHaveLength(1);
            expect(messages[0].content).toBe("second");
        });

        it("rejects whitespace-only content, which the migration forbids", async () => {
            // The Zod schema is min(1) and passes "   ", so only the CHECK constraint catches it.
            await expect(seedMessage(GUILD_A, "   ")).rejects.toThrow(/chk_economy_work_messages_content_not_blank/);
        });

        it("rejects content past the 1000 character limit", async () => {
            await expect(seedMessage(GUILD_A, "a".repeat(1001))).rejects.toThrow(
                /chk_economy_work_messages_content_len/
            );
        });
    });

    describe("getEconomyWorkMessages", () => {
        it("returns only the requested guild's messages, oldest first", async () => {
            const second = await seedMessage(GUILD_A, "second");
            const first = await seedMessage(GUILD_A, "first");
            await seedMessage(GUILD_B, "other guild");

            // CURRENT_TIMESTAMP is the transaction start time, so rows written together tie.
            // Stagger them explicitly to make the ordering assertion meaningful.
            await db.query("UPDATE economy_work_messages SET created_at = $2::timestamptz WHERE id = $1::uuid", [
                first.id,
                "2026-01-01T00:00:00Z",
            ]);
            await db.query("UPDATE economy_work_messages SET created_at = $2::timestamptz WHERE id = $1::uuid", [
                second.id,
                "2026-01-02T00:00:00Z",
            ]);

            const messages = await getEconomyWorkMessages(GUILD_A);

            expect(messages.map((m) => m.content)).toEqual(["first", "second"]);
        });
    });

    describe("deleteEconomyWorkMessage", () => {
        it("refuses to delete a message belonging to another guild", async () => {
            const foreign = await seedMessage(GUILD_B, "not yours");

            const deleted = await deleteEconomyWorkMessage(GUILD_A, foreign.id);

            expect(deleted).toBe(false);
            expect(await getEconomyWorkMessages(GUILD_B)).toHaveLength(1);
        });
    });

    describe("syncEconomyWorkMessages", () => {
        it("replaces the guild's set, adding, updating and removing in one transaction", async () => {
            const keep = await seedMessage(GUILD_A, "keep me");
            await seedMessage(GUILD_A, "drop me");
            await seedMessage(GUILD_B, "untouched");

            const result = await syncEconomyWorkMessages(GUILD_A, [
                { id: keep.id, content: "keep me, edited" },
                { content: "brand new" },
            ]);

            expect(result.map((m) => m.content).sort()).toEqual(["brand new", "keep me, edited"]);
            expect(await getEconomyWorkMessages(GUILD_A)).toHaveLength(2);
            expect(await getEconomyWorkMessages(GUILD_B)).toHaveLength(1);
        });

        it("clears the guild's messages when given an empty list", async () => {
            await seedMessage(GUILD_A, "one");
            await seedMessage(GUILD_A, "two");
            await seedMessage(GUILD_B, "untouched");

            expect(await syncEconomyWorkMessages(GUILD_A, [])).toEqual([]);
            expect(await getEconomyWorkMessages(GUILD_A)).toHaveLength(0);
            expect(await getEconomyWorkMessages(GUILD_B)).toHaveLength(1);
        });

        it("rolls the whole sync back when one message violates a constraint", async () => {
            const kept = await seedMessage(GUILD_A, "kept");
            const doomed = await seedMessage(GUILD_A, "doomed");

            // The delete runs before the insert, so a throwing insert proves ROLLBACK works.
            await expect(
                syncEconomyWorkMessages(GUILD_A, [
                    { id: kept.id, content: "   " },
                    { id: doomed.id, content: "replacement" },
                ])
            ).rejects.toThrow(/chk_economy_work_messages_content_not_blank/);

            const survivors = await getEconomyWorkMessages(GUILD_A);
            expect(survivors.map((m) => m.content)).toEqual(["kept", "doomed"]);
        });
    });
});