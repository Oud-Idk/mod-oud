use crate::features::economy::types::Item;
use chrono::{DateTime, Utc};
use serde_json::Value;
use serenity::all::GuildId;
use sqlx::PgPool;
use uuid::Uuid;

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
    if quantity <= 0 {
        return Ok(None);
    }

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
