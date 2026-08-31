import {
    EconomyConfig,
    economyConfigSchema,
    EconomyItem,
    economyItemSchema,
} from "@/features/economy/types";
import { getGuildConfigField, saveGuildConfigField } from "@/features/_shared/guild";
import { db } from "@/lib/db";

export async function saveEconomyConfig(guildId: string, config: EconomyConfig): Promise<void> {
    await saveGuildConfigField(guildId, "economy", config);
}

export async function getEconomyConfig(guildId: string): Promise<EconomyConfig> {
    const dbEconomy = await getGuildConfigField(guildId, "economy");
    return economyConfigSchema.parse(dbEconomy ?? {});
}

interface EconomyItemRow {
    id: string;
    guild_id: string;
    name: string;
    description: string;
    price: string | number;
    category_id: string | null;
    emoji_unicode: string | null;
    emoji_id: string | null;
    is_inventory: boolean;
    is_usable: boolean;
    is_sellable: boolean;
    is_listed: boolean;
    unlimited_stock: boolean;
    stock_remaining: number;
    requirements: unknown;
    actions: unknown;
    expires_at: Date | null;
    created_at: Date;
}

function mapRowToItem(row: EconomyItemRow): EconomyItem {
    let emoji: string | undefined = undefined;
    if (row.emoji_id !== null && row.emoji_id !== "") {
        emoji = `<:item:${row.emoji_id}>`;
    } else if (row.emoji_unicode !== null && row.emoji_unicode !== "") {
        emoji = row.emoji_unicode;
    }

    const priceNum = Number(row.price);

    return economyItemSchema.parse({
        id: row.id,
        name: row.name,
        description: row.description,
        price: Number.isNaN(priceNum) ? 0 : Math.max(0, priceNum),
        category: row.category_id,
        emoji,
        unlimitedStock: row.unlimited_stock,
        stockRemaining: row.unlimited_stock ? 0 : Math.max(0, row.stock_remaining),
        isListed: row.is_listed,
        isInventory: row.is_inventory,
        isUsable: row.is_usable,
        isSellable: row.is_sellable,
        requirements: row.requirements ?? [],
        actions: row.actions ?? [],
    });
}

function parseEmoji(emojiStr?: string): { unicode: string | null; id: string | null } {
    if (emojiStr === undefined || emojiStr.trim() === "") {
        return { unicode: null, id: null };
    }
    const e = emojiStr.trim();
    if (e.startsWith("<") && e.endsWith(">")) {
        const inner = e.slice(1, -1);
        const parts = inner.split(":");
        if (parts.length >= 3) {
            return { unicode: null, id: parts[2] };
        }
    }
    return { unicode: e, id: null };
}

// ---------------------------------------------------------------------------
// Item Queries
// ---------------------------------------------------------------------------

export async function getEconomyItems(guildId: string): Promise<EconomyItem[]> {
    const { rows } = await db.query<EconomyItemRow>(
        `
            SELECT *
            FROM economy_items
            WHERE guild_id = $1
              AND (expires_at IS NULL OR expires_at > NOW())
            ORDER BY name ASC
        `,
        [guildId]
    );

    return rows.map(mapRowToItem);
}

export async function getEconomyItem(guildId: string, itemId: string): Promise<EconomyItem | null> {
    const { rows } = await db.query<EconomyItemRow>(
        `
            SELECT *
            FROM economy_items
            WHERE guild_id = $1
              AND id = $2
        `,
        [guildId, itemId]
    );

    if (rows.length === 0) return null;
    return mapRowToItem(rows[0]);
}

export async function saveEconomyItem(guildId: string, item: EconomyItem): Promise<EconomyItem> {
    const itemId = item.id ?? crypto.randomUUID();
    const { unicode, id: emojiId } = parseEmoji(item.emoji);

    const { rows } = await db.query<EconomyItemRow>(
        `
            INSERT INTO economy_items (id, guild_id, name, description, price, category_id,
                                       emoji_unicode, emoji_id, is_inventory, is_usable,
                                       is_sellable,
                                       is_listed, unlimited_stock, stock_remaining, requirements,
                                       actions)
            VALUES ($1, $2, $3, $4, $5, $6,
                    $7, $8, $9, $10, $11,
                    $12, $13, $14, $15, $16)
            ON CONFLICT (id) DO UPDATE SET name            = EXCLUDED.name,
                                           description     = EXCLUDED.description,
                                           price           = EXCLUDED.price,
                                           category_id     = EXCLUDED.category_id,
                                           emoji_unicode   = EXCLUDED.emoji_unicode,
                                           emoji_id        = EXCLUDED.emoji_id,
                                           is_inventory    = EXCLUDED.is_inventory,
                                           is_usable       = EXCLUDED.is_usable,
                                           is_sellable     = EXCLUDED.is_sellable,
                                           is_listed       = EXCLUDED.is_listed,
                                           unlimited_stock = EXCLUDED.unlimited_stock,
                                           stock_remaining = EXCLUDED.stock_remaining,
                                           requirements    = EXCLUDED.requirements,
                                           actions         = EXCLUDED.actions
            RETURNING *
        `,
        [
            itemId,
            guildId,
            item.name,
            item.description,
            item.price,
            item.category ?? null,
            unicode,
            emojiId,
            item.isInventory,
            item.isUsable,
            item.isSellable,
            item.isListed,
            item.unlimitedStock,
            item.unlimitedStock ? 0 : item.stockRemaining,
            JSON.stringify(item.requirements),
            JSON.stringify(item.actions),
        ]
    );

    return mapRowToItem(rows[0]);
}

export async function deleteEconomyItem(guildId: string, itemId: string): Promise<boolean> {
    const result = await db.query(
        `
            DELETE
            FROM economy_items
            WHERE guild_id = $1
              AND id = $2
        `,
        [guildId, itemId]
    );

    return (result.rowCount ?? 0) > 0;
}