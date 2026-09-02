use crate::features::economy::types::{Balance, Item};
use chrono::{DateTime, Utc};
use serde_json::Value;
use serenity::all::{GuildId, UserId};
use sqlx::{PgConnection, PgPool};
use uuid::Uuid;

#[derive(sqlx::FromRow)]
struct RawItem {
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
}

impl From<RawItem> for Item {
    fn from(r: RawItem) -> Self {
        Self {
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
        }
    }
}

#[derive(sqlx::FromRow)]
struct RawBalance {
    guild_id: i64,
    user_id: i64,
    cash: i64,
    bank: i64,
}

impl From<RawBalance> for Balance {
    fn from(r: RawBalance) -> Self {
        Self {
            guild_id: GuildId::new(r.guild_id.cast_unsigned()),
            user_id: UserId::new(r.user_id.cast_unsigned()),
            cash: r.cash,
            bank: r.bank,
        }
    }
}

pub enum PurchaseError {
    InvalidQuantity,
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
) -> Result<Result<(Item, Balance), PurchaseError>, sqlx::Error> {
    if quantity <= 0 {
        return Ok(Err(PurchaseError::InvalidQuantity));
    }

    let mut tx = db.begin().await?;

    let item = match deduct_item_stock(&mut tx, guild_id, item_id, quantity).await? {
        Ok(item) => item,
        Err(err) => return Ok(Err(err)),
    };

    let Some(total_cost) = item.price.checked_mul(i64::from(quantity)) else {
        return Ok(Err(PurchaseError::InvalidQuantity));
    };

    let balance = match deduct_user_balance(&mut tx, guild_id, user_id, total_cost).await? {
        Ok(balance) => balance,
        Err(err) => return Ok(Err(err)),
    };

    if item.is_inventory {
        upsert_inventory_item(&mut tx, guild_id, user_id, item.id, quantity).await?;
    }

    tx.commit().await?;
    Ok(Ok((item, balance)))
}

async fn deduct_item_stock(
    tx: &mut PgConnection,
    guild_id: GuildId,
    item_id: Uuid,
    quantity: i32,
) -> Result<Result<Item, PurchaseError>, sqlx::Error> {
    let row = sqlx::query_as!(
        RawItem,
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
                  requirements, actions,
                  expires_at, created_at
        "#,
        guild_id.get().cast_signed(),
        item_id,
        quantity,
    )
    .fetch_optional(&mut *tx)
    .await?;

    let Some(r) = row else {
        let current_stock = sqlx::query_scalar!(
            r#"
            SELECT stock_remaining
            FROM economy_items
            WHERE guild_id = $1 AND id = $2 AND (expires_at IS NULL OR expires_at > NOW())
            "#,
            guild_id.get().cast_signed(),
            item_id,
        )
        .fetch_optional(&mut *tx)
        .await?;

        return Ok(Err(current_stock
            .map_or(PurchaseError::ItemNotFoundOrExpired, |stock| {
                PurchaseError::InsufficientStock { remaining: stock }
            })));
    };

    Ok(Ok(r.into()))
}

async fn deduct_user_balance(
    tx: &mut PgConnection,
    guild_id: GuildId,
    user_id: UserId,
    total_cost: i64,
) -> Result<Result<Balance, PurchaseError>, sqlx::Error> {
    let balance_row = sqlx::query_as!(
        RawBalance,
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

    Ok(Ok(b.into()))
}

async fn upsert_inventory_item(
    tx: &mut PgConnection,
    guild_id: GuildId,
    user_id: UserId,
    item_id: Uuid,
    quantity: i32,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO economy_inventory (guild_id, user_id, item_id, quantity)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (guild_id, user_id, item_id) DO UPDATE SET
            quantity = economy_inventory.quantity + EXCLUDED.quantity
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        item_id,
        quantity,
    )
    .execute(&mut *tx)
    .await?;

    Ok(())
}

pub enum SellError {
    InvalidQuantity,
    NotSellable,
    InsufficientQuantity { owned: i32 },
    ItemNotFound,
}

pub async fn sell_item_tx(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    item_id: Uuid,
    quantity: i32,
) -> Result<Result<(Item, Balance), SellError>, sqlx::Error> {
    if quantity <= 0 {
        return Ok(Err(SellError::InvalidQuantity));
    }

    let mut tx = db.begin().await?;

    // Fetch & Validate Item
    let Some(item) = fetch_item_for_sale(&mut tx, guild_id, item_id).await? else {
        return Ok(Err(SellError::ItemNotFound));
    };

    if !item.is_sellable {
        return Ok(Err(SellError::NotSellable));
    }

    // Lock & Deduct from Inventory
    if let Err(err) = deduct_inventory(&mut tx, guild_id, user_id, item_id, quantity).await? {
        return Ok(Err(err));
    }

    // Calculate refund
    let Some(total_refund) = item.price.checked_mul(i64::from(quantity)) else {
        return Ok(Err(SellError::InvalidQuantity)); // Overflow protection
    };

    // Credit balance & restock shop
    let balance = credit_balance(&mut tx, guild_id, user_id, total_refund).await?;

    if !item.unlimited_stock {
        restock_item(&mut tx, guild_id, item_id, quantity).await?;
    }

    tx.commit().await?;

    Ok(Ok((item, balance)))
}

/// Fetches the item details needed for the sale.
async fn fetch_item_for_sale(
    tx: &mut sqlx::PgTransaction<'_>,
    guild_id: GuildId,
    item_id: Uuid,
) -> Result<Option<Item>, sqlx::Error> {
    let row = sqlx::query_as!(
        RawItem,
        r#"
        SELECT id, guild_id, name, description, price, category_id,
               emoji_unicode, emoji_id, is_inventory, is_usable, is_sellable,
               is_listed, unlimited_stock, stock_remaining,
               requirements, actions,
               expires_at, created_at
        FROM economy_items
        WHERE guild_id = $1 AND id = $2
        "#,
        guild_id.get().cast_signed(),
        item_id,
    )
    .fetch_optional(&mut **tx)
    .await?;

    Ok(row.map(Into::into))
}

/// Locks the user's inventory row and deducts the sold quantity.
async fn deduct_inventory(
    tx: &mut sqlx::PgTransaction<'_>,
    guild_id: GuildId,
    user_id: UserId,
    item_id: Uuid,
    quantity: i32,
) -> Result<Result<(), SellError>, sqlx::Error> {
    let owned = sqlx::query_scalar!(
        r#"
        SELECT quantity FROM economy_inventory
        WHERE guild_id = $1 AND user_id = $2 AND item_id = $3
        FOR UPDATE
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        item_id,
    )
    .fetch_optional(&mut **tx)
    .await?
    .unwrap_or(0);

    if owned < quantity {
        return Ok(Err(SellError::InsufficientQuantity { owned }));
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

    Ok(Ok(()))
}

/// Credits cash to the user's wallet.
async fn credit_balance(
    tx: &mut sqlx::PgTransaction<'_>,
    guild_id: GuildId,
    user_id: UserId,
    amount: i64,
) -> Result<Balance, sqlx::Error> {
    let row = sqlx::query_as!(
        RawBalance,
        r#"
        INSERT INTO economy_balances (guild_id, user_id, cash, bank)
        VALUES ($1, $2, $3, 0)
        ON CONFLICT (guild_id, user_id) DO UPDATE SET
            cash = economy_balances.cash + EXCLUDED.cash
        RETURNING guild_id, user_id, cash, bank
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        amount,
    )
    .fetch_one(&mut **tx)
    .await?;

    Ok(row.into())
}

/// Adds back stock for limited items.
async fn restock_item(
    tx: &mut sqlx::PgTransaction<'_>,
    guild_id: GuildId,
    item_id: Uuid,
    quantity: i32,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        UPDATE economy_items
        SET stock_remaining = stock_remaining + $3
        WHERE guild_id = $1 AND id = $2
        "#,
        guild_id.get().cast_signed(),
        item_id,
        quantity,
    )
    .execute(&mut **tx)
    .await?;

    Ok(())
}
