use crate::features::economy::types::{InventoryRow, Item};
use chrono::{DateTime, Utc};
use serde_json::Value;
use serenity::all::{GuildId, UserId};
use sqlx::{PgPool, PgTransaction};
use uuid::Uuid;

#[derive(sqlx::FromRow)]
struct RawInventoryRow {
    guild_id: i64,
    user_id: i64,
    item_id: Uuid,
    quantity: i32,
}

impl From<RawInventoryRow> for InventoryRow {
    fn from(r: RawInventoryRow) -> Self {
        Self {
            guild_id: GuildId::new(r.guild_id.cast_unsigned()),
            user_id: UserId::new(r.user_id.cast_unsigned()),
            item_id: r.item_id,
            quantity: r.quantity,
        }
    }
}

#[derive(sqlx::FromRow)]
struct RawInventoryItem {
    id: Uuid,
    guild_id: i64,
    name: String,
    description: String,
    price: i64,
    category_id: Option<Uuid>,
    emoji_unicode: Option<String>,
    emoji_id: Option<String>,
    is_inventory: bool,
    is_usable: bool,
    is_sellable: bool,
    is_listed: bool,
    unlimited_stock: bool,
    stock_remaining: i32,
    requirements: Value,
    actions: Value,
    expires_at: Option<DateTime<Utc>>,
    created_at: DateTime<Utc>,
    quantity: i32,
}

/// Fetch all inventory rows for a user in a guild.
pub async fn get_inventory(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<Vec<InventoryRow>, sqlx::Error> {
    let rows = sqlx::query_as!(
        RawInventoryRow,
        r#"
        SELECT guild_id, user_id, item_id, quantity
        FROM economy_inventory
        WHERE guild_id = $1 AND user_id = $2
        ORDER BY item_id
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
    )
    .fetch_all(db)
    .await?;

    Ok(rows.into_iter().map(Into::into).collect())
}

/// Fetch a single inventory row for a specific item.
pub async fn get_inventory_item(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    item_id: Uuid,
) -> Result<Option<InventoryRow>, sqlx::Error> {
    let row = sqlx::query_as!(
        RawInventoryRow,
        r#"
        SELECT guild_id, user_id, item_id, quantity
        FROM economy_inventory
        WHERE guild_id = $1 AND user_id = $2 AND item_id = $3
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        item_id,
    )
    .fetch_optional(db)
    .await?;

    Ok(row.map(Into::into))
}

/// Add an item to a user's inventory (upserts, incrementing quantity).
pub async fn add_inventory_item(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    item_id: Uuid,
    quantity: i32,
) -> Result<InventoryRow, sqlx::Error> {
    let row = sqlx::query_as!(
        RawInventoryRow,
        r#"
        INSERT INTO economy_inventory (guild_id, user_id, item_id, quantity)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET
            quantity = economy_inventory.quantity + EXCLUDED.quantity
        RETURNING guild_id, user_id, item_id, quantity
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        item_id,
        quantity,
    )
    .fetch_one(db)
    .await?;

    Ok(row.into())
}

/// Remove an item from a user's inventory. Deletes the row if quantity reaches 0.
pub async fn remove_inventory_item(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    item_id: Uuid,
    quantity: i32,
) -> Result<(), sqlx::Error> {
    if quantity <= 0 {
        return Ok(());
    }

    sqlx::query!(
        r#"
        WITH deleted AS (
            DELETE FROM economy_inventory
            WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 AND quantity = $4
            RETURNING 1
        )
        UPDATE economy_inventory
        SET quantity = quantity - $4
        WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 AND quantity > $4
          AND NOT EXISTS (SELECT 1 FROM deleted)
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        item_id,
        quantity,
    )
    .execute(db)
    .await?;

    Ok(())
}

/// Check if a user has at least `quantity` of an item.
pub async fn has_item(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    item_id: Uuid,
    quantity: i32,
) -> Result<bool, sqlx::Error> {
    if quantity <= 0 {
        return Ok(true);
    }

    let row = sqlx::query_scalar!(
        r#"
        SELECT quantity FROM economy_inventory
        WHERE guild_id = $1 AND user_id = $2 AND item_id = $3
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        item_id,
    )
    .fetch_optional(db)
    .await?;

    Ok(row.is_some_and(|q| q >= quantity))
}

/// Fetch a user's entire inventory joined with item data in a single query.
pub async fn get_inventory_with_items(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<Vec<(Item, i32)>, sqlx::Error> {
    let rows = sqlx::query_as!(
        RawInventoryItem,
        r#"
        SELECT i.id, i.guild_id, i.name, i.description, i.price, i.category_id,
               i.emoji_unicode, i.emoji_id, i.is_inventory, i.is_usable, i.is_sellable,
               i.is_listed, i.unlimited_stock, i.stock_remaining,
               i.requirements, i.actions,
               i.expires_at, i.created_at,
               inv.quantity
        FROM economy_inventory inv
        JOIN economy_items i ON inv.guild_id = i.guild_id AND inv.item_id = i.id
        WHERE inv.guild_id = $1 AND inv.user_id = $2
        ORDER BY i.name
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
    )
    .fetch_all(db)
    .await?;

    let result = rows
        .into_iter()
        .map(|r| {
            let quantity = r.quantity;
            let item = Item {
                id: r.id,
                guild_id: GuildId::new(r.guild_id.cast_unsigned()),
                name: r.name,
                description: r.description,
                price: r.price,
                category_id: r.category_id,
                emoji_unicode: r.emoji_unicode,
                emoji_id: r.emoji_id,
                is_inventory: r.is_inventory,
                is_usable: r.is_usable,
                is_sellable: r.is_sellable,
                is_listed: r.is_listed,
                unlimited_stock: r.unlimited_stock,
                stock_remaining: r.stock_remaining,
                requirements: r.requirements,
                actions: r.actions,
                expires_at: r.expires_at,
                created_at: r.created_at,
            };
            (item, quantity)
        })
        .collect();

    Ok(result)
}

/// Add an item to inventory within an active transaction (upserts/increments).
pub async fn add_inventory_item_tx(
    tx: &mut PgTransaction<'_>,
    guild_id: GuildId,
    user_id: UserId,
    item_id: Uuid,
    quantity: i32,
) -> Result<InventoryRow, sqlx::Error> {
    let row = sqlx::query_as!(
        RawInventoryRow,
        r#"
        INSERT INTO economy_inventory (guild_id, user_id, item_id, quantity)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET
            quantity = economy_inventory.quantity + EXCLUDED.quantity
        RETURNING guild_id, user_id, item_id, quantity
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        item_id,
        quantity,
    )
    .fetch_one(&mut **tx)
    .await?;

    Ok(row.into())
}

/// Remove an item within a transaction. Deletes the row if quantity reaches 0.
pub async fn remove_inventory_item_tx(
    tx: &mut PgTransaction<'_>,
    guild_id: GuildId,
    user_id: UserId,
    item_id: Uuid,
    quantity: i32,
) -> Result<(), sqlx::Error> {
    if quantity <= 0 {
        return Ok(());
    }

    sqlx::query!(
        r#"
        WITH deleted AS (
            DELETE FROM economy_inventory
            WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 AND quantity = $4
            RETURNING 1
        )
        UPDATE economy_inventory
        SET quantity = quantity - $4
        WHERE guild_id = $1 AND user_id = $2 AND item_id = $3 AND quantity > $4
          AND NOT EXISTS (SELECT 1 FROM deleted)
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        item_id,
        quantity,
    )
    .execute(&mut **tx)
    .await?;

    Ok(())
}

/// Fetch a single inventory row inside a transaction.
pub async fn get_inventory_item_tx(
    tx: &mut PgTransaction<'_>,
    guild_id: GuildId,
    user_id: UserId,
    item_id: Uuid,
) -> Result<Option<InventoryRow>, sqlx::Error> {
    let row = sqlx::query_as!(
        RawInventoryRow,
        r#"
        SELECT guild_id, user_id, item_id, quantity
        FROM economy_inventory
        WHERE guild_id = $1 AND user_id = $2 AND item_id = $3
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        item_id,
    )
    .fetch_optional(&mut **tx)
    .await?;

    Ok(row.map(Into::into))
}

/// Check if a user has at least `quantity` of an item inside a transaction.
pub async fn has_item_tx(
    tx: &mut PgTransaction<'_>,
    guild_id: GuildId,
    user_id: UserId,
    item_id: Uuid,
    quantity: i32,
) -> Result<bool, sqlx::Error> {
    if quantity <= 0 {
        return Ok(true);
    }

    let row = sqlx::query_scalar!(
        r#"
        SELECT quantity FROM economy_inventory
        WHERE guild_id = $1 AND user_id = $2 AND item_id = $3
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        item_id,
    )
    .fetch_optional(&mut **tx)
    .await?;

    Ok(row.is_some_and(|q| q >= quantity))
}
