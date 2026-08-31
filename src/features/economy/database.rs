use super::types::{Balance, InventoryRow, Item};
use crate::core::config::state::Context;
use chrono::{DateTime, Utc};
use serde_json::Value;
use serenity::all::{GuildId, UserId};
use sqlx::PgPool;
use uuid::Uuid;

pub async fn get_balance(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<Balance, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        SELECT guild_id, user_id, cash, bank
        FROM economy_balances
        WHERE guild_id = $1 AND user_id = $2
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
    )
        .fetch_optional(db)
        .await?;

    match row {
        Some(r) => Ok(Balance::from_raw(r.guild_id, r.user_id, r.cash, r.bank)),
        None => Ok(Balance {
            guild_id,
            user_id,
            cash: 0,
            bank: 0,
        }),
    }
}

pub async fn upsert_balance(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    cash: i64,
    bank: i64,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO economy_balances (guild_id, user_id, cash, bank)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (guild_id, user_id) DO UPDATE SET
            cash = EXCLUDED.cash,
            bank = EXCLUDED.bank
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        cash,
        bank,
    )
        .execute(db)
        .await?;

    Ok(())
}

pub async fn add_cash(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    amount: i64,
) -> Result<Balance, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        INSERT INTO economy_balances (guild_id, user_id, cash)
        VALUES ($1, $2, $3)
        ON CONFLICT (guild_id, user_id) DO UPDATE SET
            cash = economy_balances.cash + EXCLUDED.cash
        RETURNING guild_id, user_id, cash, bank
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        amount,
    )
        .fetch_one(db)
        .await?;

    Ok(Balance::from_raw(
        row.guild_id,
        row.user_id,
        row.cash,
        row.bank,
    ))
}

pub async fn transfer_cash_to_bank(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    amount: i64,
) -> Result<Option<Balance>, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        UPDATE economy_balances
        SET cash = cash - $3, bank = bank + $3
        WHERE guild_id = $1 AND user_id = $2 AND cash >= $3
        RETURNING guild_id, user_id, cash, bank
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        amount,
    )
        .fetch_optional(db)
        .await?;

    Ok(row.map(|r| Balance::from_raw(r.guild_id, r.user_id, r.cash, r.bank)))
}

pub struct CreateItemParams<'a> {
    pub name: &'a str,
    pub description: &'a str,
    pub price: i64,
    pub category_id: Option<Uuid>,
    pub emoji_unicode: Option<&'a str>,
    pub emoji_id: Option<&'a str>,
    pub is_inventory: bool,
    pub is_usable: bool,
    pub is_sellable: bool,
    pub is_listed: bool,
    pub unlimited_stock: bool,
    pub stock_remaining: i32,
    pub requirements: &'a Value,
    pub actions: &'a Value,
    pub expires_at: Option<DateTime<Utc>>,
}

/// Insert a new store item and return it.
pub async fn create_item(
    db: &PgPool,
    guild_id: GuildId,
    params: CreateItemParams<'_>,
) -> Result<Item, sqlx::Error> {
    sqlx::query_as!(
        Item,
        r#"
        INSERT INTO economy_items (
            guild_id, name, description, price, category_id,
            emoji_unicode, emoji_id, is_inventory, is_usable, is_sellable,
            is_listed, unlimited_stock, stock_remaining, requirements, actions,
            expires_at
        )
        VALUES (
            $1, $2, $3, $4, $5,
            $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15,
            $16
        )
        RETURNING id, guild_id, name, description, price, category_id,
                  emoji_unicode, emoji_id, is_inventory, is_usable, is_sellable,
                  is_listed, unlimited_stock, stock_remaining,
                  requirements AS "requirements: serde_json::Value",
                  actions AS "actions: serde_json::Value",
                  expires_at, created_at
        "#,
        guild_id.get().cast_signed(),
        params.name,
        params.description,
        params.price,
        params.category_id,
        params.emoji_unicode,
        params.emoji_id,
        params.is_inventory,
        params.is_usable,
        params.is_sellable,
        params.is_listed,
        params.unlimited_stock,
        params.stock_remaining,
        params.requirements as &Value,
        params.actions as &Value,
        params.expires_at,
    )
        .fetch_one(db)
        .await
}

/// Fetch a single item by UUID, within a guild.
pub async fn get_item(
    db: &PgPool,
    guild_id: GuildId,
    item_id: Uuid,
) -> Result<Option<Item>, sqlx::Error> {
    sqlx::query_as!(
        Item,
        r#"
        SELECT id, guild_id, name, description, price, category_id,
               emoji_unicode, emoji_id, is_inventory, is_usable, is_sellable,
               is_listed, unlimited_stock, stock_remaining,
               requirements AS "requirements: serde_json::Value",
               actions AS "actions: serde_json::Value",
               expires_at, created_at
        FROM economy_items
        WHERE guild_id = $1 AND id = $2
        "#,
        guild_id.get().cast_signed(),
        item_id,
    )
        .fetch_optional(db)
        .await
}

/// Fetch a single item by name (case-insensitive), within a guild.
pub async fn get_item_by_name(
    db: &PgPool,
    guild_id: GuildId,
    name: &str,
) -> Result<Option<Item>, sqlx::Error> {
    sqlx::query_as!(
        Item,
        r#"
        SELECT id, guild_id, name, description, price, category_id,
               emoji_unicode, emoji_id, is_inventory, is_usable, is_sellable,
               is_listed, unlimited_stock, stock_remaining,
               requirements AS "requirements: serde_json::Value",
               actions AS "actions: serde_json::Value",
               expires_at, created_at
        FROM economy_items
        WHERE guild_id = $1 AND LOWER(name) = LOWER($2)
        "#,
        guild_id.get().cast_signed(),
        name,
    )
        .fetch_optional(db)
        .await
}

/// List all items for a guild.
pub async fn list_items(db: &PgPool, guild_id: GuildId) -> Result<Vec<Item>, sqlx::Error> {
    sqlx::query_as!(
        Item,
        r#"
        SELECT id, guild_id, name, description, price, category_id,
               emoji_unicode, emoji_id, is_inventory, is_usable, is_sellable,
               is_listed, unlimited_stock, stock_remaining,
               requirements AS "requirements: serde_json::Value",
               actions AS "actions: serde_json::Value",
               expires_at, created_at
        FROM economy_items
        WHERE guild_id = $1
          AND (expires_at IS NULL OR expires_at > NOW())
        ORDER BY name ASC
        "#,
        guild_id.get().cast_signed(),
    )
        .fetch_all(db)
        .await
}

/// Delete an item by UUID. Returns the number of rows deleted.
pub async fn delete_item(
    db: &PgPool,
    guild_id: GuildId,
    item_id: Uuid,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query!(
        r#"
        DELETE FROM economy_items
        WHERE guild_id = $1 AND id = $2
        "#,
        guild_id.get().cast_signed(),
        item_id,
    )
        .execute(db)
        .await?;

    Ok(result.rows_affected())
}

/// Decrement stock by a specific quantity. Returns the updated item if successful,
/// or `None` if the item doesn't exist, is expired, or insufficient stock.
pub async fn decrement_stock(
    db: &PgPool,
    guild_id: GuildId,
    item_id: Uuid,
    quantity: i32,
) -> Result<Option<Item>, sqlx::Error> {
    sqlx::query_as!(
        Item,
        r#"
        UPDATE economy_items
        SET stock_remaining = CASE
            WHEN unlimited_stock = TRUE THEN stock_remaining
            ELSE stock_remaining - $3
        END
        WHERE guild_id = $1
          AND id = $2
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (unlimited_stock = TRUE OR stock_remaining >= $3)
        RETURNING id, guild_id, name, description, price, category_id,
                  emoji_unicode, emoji_id, is_inventory, is_usable, is_sellable,
                  is_listed, unlimited_stock, stock_remaining,
                  requirements AS "requirements: serde_json::Value",
                  actions AS "actions: serde_json::Value",
                  expires_at, created_at
        "#,
        guild_id.get().cast_signed(),
        item_id,
        quantity,
    )
        .fetch_optional(db)
        .await
}

/// Fetch all inventory rows for a user in a guild.
pub async fn get_inventory(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<Vec<InventoryRow>, sqlx::Error> {
    sqlx::query_as!(
        InventoryRow,
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
        .await
}

/// Fetch a single inventory row for a specific item.
pub async fn get_inventory_item(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    item_id: Uuid,
) -> Result<Option<InventoryRow>, sqlx::Error> {
    sqlx::query_as!(
        InventoryRow,
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
        .await
}

/// Add an item to a user's inventory (upserts, incrementing quantity).
pub async fn add_inventory_item(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    item_id: Uuid,
    quantity: i32,
) -> Result<InventoryRow, sqlx::Error> {
    sqlx::query_as!(
        InventoryRow,
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
        .await
}

/// Remove an item from a user's inventory. Deletes the row if quantity reaches 0.
pub async fn remove_inventory_item(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    item_id: Uuid,
    quantity: i32,
) -> Result<(), sqlx::Error> {
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

/// Deduct coins from a user's wallet. Returns the updated balance, or
/// `None` if the user has insufficient funds.
pub async fn deduct_cash(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    amount: i64,
) -> Result<Option<Balance>, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        UPDATE economy_balances
        SET cash = cash - $3
        WHERE guild_id = $1 AND user_id = $2 AND cash >= $3
        RETURNING guild_id, user_id, cash, bank
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        amount,
    )
        .fetch_optional(db)
        .await?;

    Ok(row.map(|r| Balance::from_raw(r.guild_id, r.user_id, r.cash, r.bank)))
}

pub async fn transfer_bank_to_cash(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    amount: i64,
) -> Result<Option<Balance>, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        UPDATE economy_balances
        SET bank = bank - $3, cash = cash + $3
        WHERE guild_id = $1 AND user_id = $2 AND bank >= $3
        RETURNING guild_id, user_id, cash, bank
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        amount,
    )
        .fetch_optional(db)
        .await?;

    Ok(row.map(|r| Balance::from_raw(r.guild_id, r.user_id, r.cash, r.bank)))
}

/// Fetch a user's entire inventory joined with item data in a single query.
pub async fn get_inventory_with_items(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<Vec<(Item, i32)>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"
        SELECT i.id, i.guild_id, i.name, i.description, i.price, i.category_id,
               i.emoji_unicode, i.emoji_id, i.is_inventory, i.is_usable, i.is_sellable,
               i.is_listed, i.unlimited_stock, i.stock_remaining,
               i.requirements AS "requirements: serde_json::Value",
               i.actions AS "actions: serde_json::Value",
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
            let item = Item {
                id: r.id,
                guild_id: r.guild_id,
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
            (item, r.quantity)
        })
        .collect();

    Ok(result)
}

pub enum PurchaseError {
    InsufficientStock { remaining: i32 },
    InsufficientFunds { wallet: i64 },
    ItemNotFoundOrExpired,
}

/// Atomically purchase an item (deduct cash, decrease stock, add to inventory) in one transaction.
pub async fn purchase_item_tx(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    item_id: Uuid,
    quantity: i32,
    total_cost: i64,
) -> Result<Result<(Item, Balance), PurchaseError>, sqlx::Error> {
    let mut tx = db.begin().await?;

    let item = sqlx::query_as!(
        Item,
        r#"
        UPDATE economy_items
        SET stock_remaining = CASE
            WHEN unlimited_stock = TRUE THEN stock_remaining
            ELSE stock_remaining - $3
        END
        WHERE guild_id = $1
          AND id = $2
          AND (expires_at IS NULL OR expires_at > NOW())
          AND (unlimited_stock = TRUE OR stock_remaining >= $3)
        RETURNING id, guild_id, name, description, price, category_id,
                  emoji_unicode, emoji_id, is_inventory, is_usable, is_sellable,
                  is_listed, unlimited_stock, stock_remaining,
                  requirements AS "requirements: serde_json::Value",
                  actions AS "actions: serde_json::Value",
                  expires_at, created_at
        "#,
        guild_id.get().cast_signed(),
        item_id,
        quantity,
    )
        .fetch_optional(&mut *tx)
        .await?;

    let Some(item) = item else {
        // Find out if it was out of stock or just doesn't exist
        let current_stock = sqlx::query_scalar!(
            r#"SELECT stock_remaining FROM economy_items WHERE guild_id = $1 AND id = $2"#,
            guild_id.get().cast_signed(),
            item_id,
        )
            .fetch_optional(&mut *tx)
            .await?;

        return match current_stock {
            Some(stock) => Ok(Err(PurchaseError::InsufficientStock { remaining: stock })),
            None => Ok(Err(PurchaseError::ItemNotFoundOrExpired)),
        };
    };

    let balance_row = sqlx::query!(
        r#"
        UPDATE economy_balances
        SET cash = cash - $3
        WHERE guild_id = $1 AND user_id = $2 AND cash >= $3
        RETURNING guild_id, user_id, cash, bank
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        total_cost,
    )
        .fetch_optional(&mut *tx)
        .await?;

    let Some(b) = balance_row else {
        let current_cash = sqlx::query_scalar!(
            r#"SELECT cash FROM economy_balances WHERE guild_id = $1 AND user_id = $2"#,
            guild_id.get().cast_signed(),
            user_id.get().cast_signed(),
        )
            .fetch_optional(&mut *tx)
            .await?
            .unwrap_or(0);

        return Ok(Err(PurchaseError::InsufficientFunds {
            wallet: current_cash,
        }));
    };

    if item.is_inventory {
        sqlx::query!(
            r#"
            INSERT INTO economy_inventory (guild_id, user_id, item_id, quantity)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET
                quantity = economy_inventory.quantity + EXCLUDED.quantity
            "#,
            guild_id.get().cast_signed(),
            user_id.get().cast_signed(),
            item.id,
            quantity,
        )
            .execute(&mut *tx)
            .await?;
    }

    tx.commit().await?;

    Ok(Ok((
        item,
        Balance::from_raw(b.guild_id, b.user_id, b.cash, b.bank),
    )))
}
