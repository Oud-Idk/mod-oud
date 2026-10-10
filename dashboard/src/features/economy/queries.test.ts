import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import {
    deleteEconomyCategory,
    deleteEconomyItem,
    deleteEconomyWorkMessage,
    fetchMoreEconomyLeaderboard,
    getEconomyCategories,
    getEconomyConfig,
    getEconomyItem,
    getEconomyItems,
    getEconomyLeaderboard,
    getEconomyWorkMessages,
    saveEconomyCategory,
    saveEconomyConfig,
    saveEconomyItem,
    saveEconomyWorkMessage,
    syncEconomyWorkMessages,
} from "./queries";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { economyItemSchema, type EconomyConfig, type EconomyItem } from "./types";

const mockQuery = vi.hoisted(() =>
    vi.fn<(sql: string, params?: unknown[]) => Promise<{
        rows?: unknown[];
        rowCount?: number | null;
    }>>()
);

const mockConnect = vi.hoisted(() =>
    vi.fn<() => Promise<{
        query: (sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>;
        release: () => void;
    }>>()
);

vi.mock("@/lib/db", () => ({
    db: {
        query: mockQuery,
        connect: mockConnect,
    },
}));

vi.mock("@/features/_shared/guild", () => ({
    getGuildConfigField: vi.fn(),
    saveGuildConfigField: vi.fn(),
}));

const GUILD_ID = "guild_123";
const ITEM_UUID = "11111111-1111-4111-8111-111111111111";
const CATEGORY_UUID = "22222222-2222-4222-8222-222222222222";
const MESSAGE_UUID = "33333333-3333-4333-8333-333333333333";

function itemRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        id: ITEM_UUID,
        guild_id: GUILD_ID,
        name: "Sword",
        description: "Sharp",
        price: 250,
        category_id: null,
        emoji_unicode: null,
        emoji_id: null,
        is_inventory: true,
        is_usable: false,
        is_sellable: false,
        is_listed: true,
        unlimited_stock: true,
        stock_remaining: 0,
        requirements: [],
        actions: [],
        ...overrides,
    };
}

interface StubClient {
    query: Mock<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>;
    release: Mock<() => void>;
}

// Takes the raw pre-parse payload, so a test only spells out the fields it cares
// about and the schema under test supplies the rest.
function validItem(overrides: Record<string, unknown> = {}): EconomyItem {
    return economyItemSchema.parse({ name: "Sword", ...overrides });
}

function sqlOf(callIndex = 0): string {
    return mockQuery.mock.calls[callIndex]?.[0] ?? "";
}

function paramsOf(callIndex = 0): unknown[] {
    return mockQuery.mock.calls[callIndex]?.[1] ?? [];
}

function stubClient(rows: unknown[] = []): StubClient {
    const query = vi.fn<(sql: string, params?: unknown[]) => Promise<{ rows?: unknown[] }>>(
        () => Promise.resolve({ rows })
    );
    const release = vi.fn<() => void>();
    mockConnect.mockResolvedValue({ query, release });
    return { query, release };
}

function statementsOf(query: Mock<(sql: string, params?: unknown[]) => Promise<unknown>>): string[] {
    return query.mock.calls.map((call) => call[0]);
}

describe("Economy Query Module", () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("getEconomyConfig", () => {
        it("should return default config when DB returns null", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue(null);

            const result = await getEconomyConfig(GUILD_ID);

            expect(getGuildConfigField).toHaveBeenCalledWith(GUILD_ID, "economy");
            expect(result.enabled).toBe(false);
            expect(result.currencyName).toBe("coins");
            expect(result.workCooldownSecs).toBe(3600);
            expect(result.workMinReward).toBe(1000);
            expect(result.workMaxReward).toBe(5000);
        });

        it("should merge partial saved DB config with Zod defaults", async () => {
            vi.mocked(getGuildConfigField).mockResolvedValue({
                enabled: true,
                currencyName: "rubies",
            });

            const result = await getEconomyConfig(GUILD_ID);

            expect(result.enabled).toBe(true);
            expect(result.currencyName).toBe("rubies");
            expect(result.workCooldownSecs).toBe(3600);
            expect(result.workMinReward).toBe(1000);
            expect(result.workMaxReward).toBe(5000);
        });

        it("should keep every field of a fully populated config", async () => {
            const stored: EconomyConfig = {
                enabled: true,
                currencyName: "diamonds",
                workCooldownSecs: 900,
                workMinReward: 10,
                workMaxReward: 20,
                workMessage: "Nice work",
                startingBalance: 250,
                giftingEnabled: false,
            };
            vi.mocked(getGuildConfigField).mockResolvedValue(stored);

            expect(await getEconomyConfig(GUILD_ID)).toEqual(stored);
        });

        it("should propagate a database error from getGuildConfigField", async () => {
            vi.mocked(getGuildConfigField).mockRejectedValue(
                new Error("Database connection lost in the coin vault")
            );

            await expect(getEconomyConfig(GUILD_ID)).rejects.toThrow(
                "Database connection lost in the coin vault"
            );
        });
    });

    describe("saveEconomyConfig", () => {
        it("should save the config under the economy key", async () => {
            const config = economyConfigFixture();

            await saveEconomyConfig(GUILD_ID, config);

            expect(saveGuildConfigField).toHaveBeenCalledWith(GUILD_ID, "economy", config);
        });

        it("should propagate a database error from saveGuildConfigField", async () => {
            vi.mocked(saveGuildConfigField).mockRejectedValue(
                new Error("Failed to write to economy ledger")
            );

            await expect(saveEconomyConfig(GUILD_ID, economyConfigFixture())).rejects.toThrow(
                "Failed to write to economy ledger"
            );
        });
    });

    describe("getEconomyItems", () => {
        it("should query the guild's items and map every row", async () => {
            mockQuery.mockResolvedValue({
                rows: [itemRow(), itemRow({ id: CATEGORY_UUID, name: "Shield" })],
                rowCount: 2,
            });

            const result = await getEconomyItems(GUILD_ID);

            expect(mockQuery).toHaveBeenCalledTimes(1);
            expect(sqlOf()).toContain("FROM economy_items");
            expect(sqlOf()).toContain("guild_id = $1");
            expect(sqlOf()).toContain("expires_at IS NULL OR expires_at > NOW()");
            expect(paramsOf()).toEqual([GUILD_ID]);
            expect(result.map((i) => i.name)).toEqual(["Sword", "Shield"]);
        });

        it("should return an empty array when no rows match", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            expect(await getEconomyItems(GUILD_ID)).toEqual([]);
        });

        it("should map a numeric-string price from a bigint column", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow({ price: "900" })], rowCount: 1 });

            expect((await getEconomyItems(GUILD_ID))[0].price).toBe(900);
        });

        it("should fall back to a price of 0 when the stored price is not a number", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow({ price: "abc" })], rowCount: 1 });

            expect((await getEconomyItems(GUILD_ID))[0].price).toBe(0);
        });

        it("should clamp a negative stored price to 0", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow({ price: -50 })], rowCount: 1 });

            expect((await getEconomyItems(GUILD_ID))[0].price).toBe(0);
        });

        it("should render a custom emoji from emoji_id", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow({ emoji_id: "987654321" })], rowCount: 1 });

            expect((await getEconomyItems(GUILD_ID))[0].emoji).toBe("<:item:987654321>");
        });

        it("should prefer the unicode emoji when both emoji columns are populated", async () => {
            mockQuery.mockResolvedValue({
                rows: [itemRow({ emoji_id: "987654321", emoji_unicode: "⚔️" })],
                rowCount: 1,
            });

            expect((await getEconomyItems(GUILD_ID))[0].emoji).toBe("<:item:987654321>");
        });

        it("should fall back to the unicode emoji when emoji_id is an empty string", async () => {
            mockQuery.mockResolvedValue({
                rows: [itemRow({ emoji_id: "", emoji_unicode: "⚔️" })],
                rowCount: 1,
            });

            expect((await getEconomyItems(GUILD_ID))[0].emoji).toBe("⚔️");
        });

        it("should leave emoji undefined when neither emoji column is populated", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            expect((await getEconomyItems(GUILD_ID))[0].emoji).toBeUndefined();
        });

        it("should leave emoji undefined when both emoji columns are empty strings", async () => {
            mockQuery.mockResolvedValue({
                rows: [itemRow({ emoji_id: "", emoji_unicode: "" })],
                rowCount: 1,
            });

            expect((await getEconomyItems(GUILD_ID))[0].emoji).toBeUndefined();
        });

        it("should expose a null category as null", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow({ category_id: null })], rowCount: 1 });

            expect((await getEconomyItems(GUILD_ID))[0].category).toBeNull();
        });

        it("should expose a populated category id", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow({ category_id: "cat_7" })], rowCount: 1 });

            expect((await getEconomyItems(GUILD_ID))[0].category).toBe("cat_7");
        });

        it("should report zero stock for unlimited items even when the column has a value", async () => {
            mockQuery.mockResolvedValue({
                rows: [itemRow({ unlimited_stock: true, stock_remaining: 99 })],
                rowCount: 1,
            });

            expect((await getEconomyItems(GUILD_ID))[0].stockRemaining).toBe(0);
        });

        it("should keep the stored stock for limited items", async () => {
            mockQuery.mockResolvedValue({
                rows: [itemRow({ unlimited_stock: false, stock_remaining: 12 })],
                rowCount: 1,
            });

            expect((await getEconomyItems(GUILD_ID))[0].stockRemaining).toBe(12);
        });

        it("should clamp negative stock on limited items to 0", async () => {
            mockQuery.mockResolvedValue({
                rows: [itemRow({ unlimited_stock: false, stock_remaining: -3 })],
                rowCount: 1,
            });

            expect((await getEconomyItems(GUILD_ID))[0].stockRemaining).toBe(0);
        });

        it("should map the boolean item flags through untouched", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    itemRow({
                        is_inventory: false,
                        is_usable: true,
                        is_sellable: true,
                        is_listed: false,
                    }),
                ],
                rowCount: 1,
            });

            expect(await getEconomyItems(GUILD_ID)).toMatchObject([
                { isInventory: false, isUsable: true, isSellable: true, isListed: false },
            ]);
        });

        it("should fall back to empty arrays when requirements and actions are null", async () => {
            mockQuery.mockResolvedValue({
                rows: [itemRow({ requirements: null, actions: null })],
                rowCount: 1,
            });

            const [item] = await getEconomyItems(GUILD_ID);
            expect(item.requirements).toEqual([]);
            expect(item.actions).toEqual([]);
        });

        it("should parse stored requirements and actions through the discriminated unions", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    itemRow({
                        requirements: [{ type: "ROLE", roleIds: ["role_a"] }],
                        actions: [{ type: "ADD_BALANCE", balance: 100 }],
                    }),
                ],
                rowCount: 1,
            });

            const [item] = await getEconomyItems(GUILD_ID);
            expect(item.requirements).toEqual([
                { type: "ROLE", matchType: "EVERY", triggerFlags: 1, roleIds: ["role_a"] },
            ]);
            expect(item.actions).toEqual([
                { type: "ADD_BALANCE", triggerFlags: 1, balance: 100 },
            ]);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getEconomyItems(GUILD_ID)).rejects.toThrow("connection lost");
        });
    });

    describe("getEconomyItem", () => {
        it("should scope the lookup to both guild and item id", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            await getEconomyItem(GUILD_ID, ITEM_UUID);

            expect(sqlOf()).toContain("FROM economy_items");
            expect(sqlOf()).toContain("guild_id = $1");
            expect(sqlOf()).toContain("id = $2");
            expect(paramsOf()).toEqual([GUILD_ID, ITEM_UUID]);
        });

        it("should return the mapped item when the row exists", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            const result = await getEconomyItem(GUILD_ID, ITEM_UUID);

            expect(result?.id).toBe(ITEM_UUID);
            expect(result?.name).toBe("Sword");
        });

        it("should return null when no row matches", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            expect(await getEconomyItem(GUILD_ID, ITEM_UUID)).toBeNull();
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getEconomyItem(GUILD_ID, ITEM_UUID)).rejects.toThrow("connection lost");
        });
    });

    describe("saveEconomyItem", () => {
        it("should insert with the supplied id and tenant-scoped params", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            await saveEconomyItem(GUILD_ID, validItem({ id: ITEM_UUID, description: "Sharp", price: 250 }));

            expect(sqlOf()).toContain("INSERT INTO economy_items");
            expect(sqlOf()).toContain("ON CONFLICT (id) DO UPDATE");
            expect(paramsOf()).toEqual([
                ITEM_UUID,
                GUILD_ID,
                "Sword",
                "Sharp",
                250,
                null,
                null,
                null,
                true,
                false,
                false,
                true,
                true,
                0,
                "[]",
                "[]",
            ]);
        });

        it("should generate a uuid when the item has no id", async () => {
            const generated = "44444444-4444-4444-8444-444444444444";
            vi.spyOn(crypto, "randomUUID").mockReturnValue(generated);
            mockQuery.mockResolvedValue({ rows: [itemRow({ id: generated })], rowCount: 1 });

            const saved = await saveEconomyItem(GUILD_ID, validItem());

            expect(paramsOf()[0]).toBe(generated);
            expect(saved.id).toBe(generated);
        });

        it("should write a null category as a null param", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            await saveEconomyItem(GUILD_ID, validItem({ category: null }));

            expect(paramsOf()[5]).toBeNull();
        });

        it("should write a populated category id as a string param", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow({ category_id: "cat_7" })], rowCount: 1 });

            await saveEconomyItem(GUILD_ID, validItem({ category: "cat_7" }));

            expect(paramsOf()[5]).toBe("cat_7");
        });

        it("should split a custom emoji into emoji_id and a null unicode", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            await saveEconomyItem(GUILD_ID, validItem({ emoji: "<:item:987654321>" }));

            expect(paramsOf()[6]).toBeNull();
            expect(paramsOf()[7]).toBe("987654321");
        });

        it("should store a unicode emoji with a null emoji_id", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            await saveEconomyItem(GUILD_ID, validItem({ emoji: "⚔️" }));

            expect(paramsOf()[6]).toBe("⚔️");
            expect(paramsOf()[7]).toBeNull();
        });

        it("should trim surrounding whitespace off a unicode emoji before storing it", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            await saveEconomyItem(GUILD_ID, validItem({ emoji: "  ⚔️  " }));

            expect(paramsOf()[6]).toBe("⚔️");
            expect(paramsOf()[7]).toBeNull();
        });

        it("should store nulls for both emoji columns when no emoji is set", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            await saveEconomyItem(GUILD_ID, validItem());

            expect(paramsOf()[6]).toBeNull();
            expect(paramsOf()[7]).toBeNull();
        });

        it("should store nulls for both emoji columns when the emoji is whitespace only", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            await saveEconomyItem(GUILD_ID, validItem({ emoji: "   " }));

            expect(paramsOf()[6]).toBeNull();
            expect(paramsOf()[7]).toBeNull();
        });

        it("should keep an unterminated custom emoji as unicode rather than reading an id", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            await saveEconomyItem(GUILD_ID, validItem({ emoji: "<:item:987" }));

            expect(paramsOf()[6]).toBe("<:item:987");
            expect(paramsOf()[7]).toBeNull();
        });

        it("should keep a custom emoji with a missing closing bracket as unicode", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            await saveEconomyItem(GUILD_ID, validItem({ emoji: "<a:b" }));

            expect(paramsOf()[6]).toBe("<a:b");
            expect(paramsOf()[7]).toBeNull();
        });

        it("should keep a bracketed emoji without a third segment as unicode", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            await saveEconomyItem(GUILD_ID, validItem({ emoji: "<a:b>" }));

            expect(paramsOf()[6]).toBe("<a:b>");
            expect(paramsOf()[7]).toBeNull();
        });

        it("should keep a colon-separated string that is not bracket-wrapped as unicode", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            await saveEconomyItem(GUILD_ID, validItem({ emoji: "a:b:c>" }));

            expect(paramsOf()[6]).toBe("a:b:c>");
            expect(paramsOf()[7]).toBeNull();
        });

        it("should force the stock param to 0 for unlimited stock", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            await saveEconomyItem(
                GUILD_ID,
                validItem({ unlimitedStock: true, stockRemaining: 42 })
            );

            expect(paramsOf()[13]).toBe(0);
        });

        it("should persist the stock param for limited stock", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow({ unlimited_stock: false })], rowCount: 1 });

            await saveEconomyItem(
                GUILD_ID,
                validItem({ unlimitedStock: false, stockRemaining: 42 })
            );

            expect(paramsOf()[13]).toBe(42);
        });

        it("should JSON.stringify the requirements and actions arrays", async () => {
            mockQuery.mockResolvedValue({ rows: [itemRow()], rowCount: 1 });

            await saveEconomyItem(
                GUILD_ID,
                validItem({
                    requirements: [{ type: "TOTAL_BALANCE", balance: 500 }],
                    actions: [{ type: "ADD_ROLES", roleIds: ["role_a"] }],
                })
            );

            expect(paramsOf()[14]).toBe(
                JSON.stringify([{ type: "TOTAL_BALANCE", triggerFlags: 1, balance: 500 }])
            );
            expect(paramsOf()[15]).toBe(
                JSON.stringify([{ type: "ADD_ROLES", triggerFlags: 1, roleIds: ["role_a"] }])
            );
        });

        it("should return the item mapped from the RETURNING row", async () => {
            mockQuery.mockResolvedValue({
                rows: [itemRow({ name: "Persisted Sword", price: 900 })],
                rowCount: 1,
            });

            const saved = await saveEconomyItem(GUILD_ID, validItem({ id: ITEM_UUID }));

            expect(saved.name).toBe("Persisted Sword");
            expect(saved.price).toBe(900);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(saveEconomyItem(GUILD_ID, validItem())).rejects.toThrow("connection lost");
        });
    });

    describe("deleteEconomyItem", () => {
        it("should scope the delete to the guild and the item", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

            await deleteEconomyItem(GUILD_ID, ITEM_UUID);

            expect(sqlOf()).toContain("DELETE");
            expect(sqlOf()).toContain("FROM economy_items");
            expect(sqlOf()).toContain("guild_id = $1");
            expect(sqlOf()).toContain("id = $2");
            expect(paramsOf()).toEqual([GUILD_ID, ITEM_UUID]);
        });

        it("should return true when a row was deleted", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

            expect(await deleteEconomyItem(GUILD_ID, ITEM_UUID)).toBe(true);
        });

        it("should return false when rowCount is 0", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            expect(await deleteEconomyItem(GUILD_ID, ITEM_UUID)).toBe(false);
        });

        it("should return false when rowCount is null", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: null });

            expect(await deleteEconomyItem(GUILD_ID, ITEM_UUID)).toBe(false);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(deleteEconomyItem(GUILD_ID, ITEM_UUID)).rejects.toThrow("connection lost");
        });
    });

    describe("getEconomyCategories", () => {
        it("should query the guild's categories and map every row", async () => {
            mockQuery.mockResolvedValue({
                rows: [
                    { id: CATEGORY_UUID, guild_id: GUILD_ID, name: "Weapons" },
                    { id: MESSAGE_UUID, guild_id: GUILD_ID, name: "Armour" },
                ],
                rowCount: 2,
            });

            const result = await getEconomyCategories(GUILD_ID);

            expect(sqlOf()).toContain("FROM economy_categories");
            expect(sqlOf()).toContain("ORDER BY name");
            expect(paramsOf()).toEqual([GUILD_ID]);
            expect(result).toEqual([
                { id: CATEGORY_UUID, name: "Weapons" },
                { id: MESSAGE_UUID, name: "Armour" },
            ]);
        });

        it("should return an empty array when no rows match", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            expect(await getEconomyCategories(GUILD_ID)).toEqual([]);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getEconomyCategories(GUILD_ID)).rejects.toThrow("connection lost");
        });
    });

    describe("saveEconomyCategory", () => {
        it("should upsert with the supplied id", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ id: CATEGORY_UUID, guild_id: GUILD_ID, name: "Weapons" }],
                rowCount: 1,
            });

            const saved = await saveEconomyCategory(GUILD_ID, { id: CATEGORY_UUID, name: "Weapons" });

            expect(sqlOf()).toContain("INSERT INTO economy_categories");
            expect(sqlOf()).toContain("ON CONFLICT (id) DO UPDATE");
            expect(paramsOf()).toEqual([CATEGORY_UUID, GUILD_ID, "Weapons"]);
            expect(saved).toEqual({ id: CATEGORY_UUID, name: "Weapons" });
        });

        it("should generate a uuid when the category has no id", async () => {
            const generated = "55555555-5555-4555-8555-555555555555";
            vi.spyOn(crypto, "randomUUID").mockReturnValue(generated);
            mockQuery.mockResolvedValue({
                rows: [{ id: generated, guild_id: GUILD_ID, name: "Weapons" }],
                rowCount: 1,
            });

            const saved = await saveEconomyCategory(GUILD_ID, { name: "Weapons" });

            expect(paramsOf()[0]).toBe(generated);
            expect(saved.id).toBe(generated);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(saveEconomyCategory(GUILD_ID, { name: "Weapons" })).rejects.toThrow(
                "connection lost"
            );
        });
    });

    describe("deleteEconomyCategory", () => {
        it("should scope the delete to the guild and the category", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

            await deleteEconomyCategory(GUILD_ID, CATEGORY_UUID);

            expect(sqlOf()).toContain("FROM economy_categories");
            expect(sqlOf()).toContain("guild_id = $1 AND id = $2");
            expect(paramsOf()).toEqual([GUILD_ID, CATEGORY_UUID]);
        });

        it("should return true when a row was deleted", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

            expect(await deleteEconomyCategory(GUILD_ID, CATEGORY_UUID)).toBe(true);
        });

        it("should return false when rowCount is 0", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            expect(await deleteEconomyCategory(GUILD_ID, CATEGORY_UUID)).toBe(false);
        });

        it("should return false when rowCount is null", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: null });

            expect(await deleteEconomyCategory(GUILD_ID, CATEGORY_UUID)).toBe(false);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(deleteEconomyCategory(GUILD_ID, CATEGORY_UUID)).rejects.toThrow(
                "connection lost"
            );
        });
    });

    describe("getEconomyWorkMessages", () => {
        it("should map every row to an id and content pair", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ id: MESSAGE_UUID, guild_id: GUILD_ID, content: "Work!" }],
                rowCount: 1,
            });

            const result = await getEconomyWorkMessages(GUILD_ID);

            expect(result).toEqual([{ id: MESSAGE_UUID, content: "Work!" }]);
        });

        it("should return an empty array when no rows match", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            expect(await getEconomyWorkMessages(GUILD_ID)).toEqual([]);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getEconomyWorkMessages(GUILD_ID)).rejects.toThrow("connection lost");
        });
    });

    describe("saveEconomyWorkMessage", () => {
        it("should generate a uuid when the message has no id", async () => {
            const generated = "66666666-6666-4666-8666-666666666666";
            vi.spyOn(crypto, "randomUUID").mockReturnValue(generated);
            mockQuery.mockResolvedValue({
                rows: [{ id: generated, guild_id: GUILD_ID, content: "Work!" }],
                rowCount: 1,
            });

            const saved = await saveEconomyWorkMessage(GUILD_ID, { content: "Work!" });

            expect(saved.id).toBe(generated);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(saveEconomyWorkMessage(GUILD_ID, { content: "Work!" })).rejects.toThrow(
                "connection lost"
            );
        });
    });

    describe("deleteEconomyWorkMessage", () => {
        it("should return true when a row was deleted", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

            expect(await deleteEconomyWorkMessage(GUILD_ID, MESSAGE_UUID)).toBe(true);
        });

        it("should return false when rowCount is 0", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            expect(await deleteEconomyWorkMessage(GUILD_ID, MESSAGE_UUID)).toBe(false);
        });

        it("should return false when rowCount is null", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: null });

            expect(await deleteEconomyWorkMessage(GUILD_ID, MESSAGE_UUID)).toBe(false);
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(deleteEconomyWorkMessage(GUILD_ID, MESSAGE_UUID)).rejects.toThrow(
                "connection lost"
            );
        });
    });

    describe("syncEconomyWorkMessages", () => {
        it("should open a transaction and commit for an empty list", async () => {
            const client = stubClient([]);

            const result = await syncEconomyWorkMessages(GUILD_ID, []);

            expect(mockConnect).toHaveBeenCalledTimes(1);
            expect(client.query.mock.calls[0][0]).toBe("BEGIN");
            expect(statementsOf(client.query)).toContain("COMMIT");
            expect(client.release).toHaveBeenCalledTimes(1);
            expect(result).toEqual([]);
        });

        it("should return the messages read back after the commit", async () => {
            stubClient([{ id: MESSAGE_UUID, guild_id: GUILD_ID, content: "Work!" }]);

            const result = await syncEconomyWorkMessages(GUILD_ID, [
                { id: MESSAGE_UUID, content: "Work!" },
            ]);

            expect(result).toEqual([{ id: MESSAGE_UUID, content: "Work!" }]);
        });

        it("should roll back, release and rethrow when a statement fails", async () => {
            const client = stubClient([]);
            client.query.mockImplementation((sql: string) =>
                sql.includes("INSERT INTO economy_work_messages")
                    ? Promise.reject(new Error("deadlock detected"))
                    : Promise.resolve({ rows: [] })
            );

            await expect(
                syncEconomyWorkMessages(GUILD_ID, [{ id: MESSAGE_UUID, content: "Work!" }])
            ).rejects.toThrow("deadlock detected");

            expect(statementsOf(client.query)).toContain("ROLLBACK");
            expect(statementsOf(client.query)).not.toContain("COMMIT");
            expect(client.release).toHaveBeenCalledTimes(1);
        });

        it("should not issue a COMMIT when BEGIN itself fails", async () => {
            const client = stubClient([]);
            client.query.mockImplementation((sql: string) =>
                sql === "BEGIN"
                    ? Promise.reject(new Error("connection lost"))
                    : Promise.resolve({ rows: [] })
            );

            await expect(syncEconomyWorkMessages(GUILD_ID, [])).rejects.toThrow("connection lost");

            expect(statementsOf(client.query)).not.toContain("COMMIT");
            expect(client.release).toHaveBeenCalledTimes(1);
        });
    });

    describe("getEconomyLeaderboard", () => {
        const leaderboardRows = [
            { userId: "user_1", username: "alpha", cash: 100, bank: 200, total: 300 },
            { userId: "user_2", username: "", cash: 50, bank: 0, total: 50 },
        ];

        it("should default to the first page of 20", async () => {
            mockQuery.mockResolvedValue({ rows: leaderboardRows, rowCount: 2 });

            const result = await getEconomyLeaderboard(GUILD_ID);

            expect(paramsOf()).toEqual([GUILD_ID, 20, 0]);
            expect(result).toEqual(leaderboardRows);
        });

        it("should order by total descending and paginate with LIMIT/OFFSET", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            await getEconomyLeaderboard(GUILD_ID, 10, 30);

            expect(sqlOf()).toContain("ORDER BY (b.cash + b.bank) DESC, b.user_id ASC");
            expect(sqlOf()).toContain("LIMIT $2 OFFSET $3");
            expect(paramsOf()).toEqual([GUILD_ID, 10, 30]);
        });

        it("should default a missing username to an empty string", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ userId: "user_2", cash: 1, bank: 2, total: 3 }],
                rowCount: 1,
            });

            expect((await getEconomyLeaderboard(GUILD_ID))[0].username).toBe("");
        });

        it("should reject an out-of-range limit before querying", async () => {
            await expect(getEconomyLeaderboard(GUILD_ID, 101, 0)).rejects.toThrow();

            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should reject a negative offset before querying", async () => {
            await expect(getEconomyLeaderboard(GUILD_ID, 20, -1)).rejects.toThrow();

            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should reject an empty guildId before querying", async () => {
            await expect(getEconomyLeaderboard("")).rejects.toThrow();

            expect(mockQuery).not.toHaveBeenCalled();
        });

        it("should reject a row that does not match the entry schema", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ userId: "user_1", cash: "lots", bank: 0, total: 0 }],
                rowCount: 1,
            });

            await expect(getEconomyLeaderboard(GUILD_ID)).rejects.toThrow();
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(getEconomyLeaderboard(GUILD_ID)).rejects.toThrow("connection lost");
        });
    });

    describe("fetchMoreEconomyLeaderboard", () => {
        it("should query only rows below the current lowest total", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ userId: "user_3", username: "gamma", cash: 1, bank: 1, total: 2 }],
                rowCount: 1,
            });

            const result = await fetchMoreEconomyLeaderboard(GUILD_ID, 300);

            expect(sqlOf()).toContain("(b.cash + b.bank) < $2");
            expect(sqlOf()).toContain("LIMIT 20");
            expect(paramsOf()).toEqual([GUILD_ID, 300]);
            expect(result).toEqual([{ userId: "user_3", username: "gamma", cash: 1, bank: 1, total: 2 }]);
        });

        it("should return an empty array when no further rows exist", async () => {
            mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

            expect(await fetchMoreEconomyLeaderboard(GUILD_ID, 300)).toEqual([]);
        });

        it("should reject a row that does not match the entry schema", async () => {
            mockQuery.mockResolvedValue({
                rows: [{ userId: "user_3", cash: "lots", bank: 0, total: 0 }],
                rowCount: 1,
            });

            await expect(fetchMoreEconomyLeaderboard(GUILD_ID, 300)).rejects.toThrow();
        });

        it("should propagate a database error", async () => {
            mockQuery.mockRejectedValue(new Error("connection lost"));

            await expect(fetchMoreEconomyLeaderboard(GUILD_ID, 300)).rejects.toThrow("connection lost");
        });
    });
});

function economyConfigFixture(): EconomyConfig {
    return {
        enabled: true,
        currencyName: "diamonds",
        workCooldownSecs: 1800,
        workMinReward: 500,
        workMaxReward: 2500,
        workMessage: "Work message",
        startingBalance: 0,
        giftingEnabled: true,
    };
}