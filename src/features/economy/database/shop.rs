use crate::features::economy::types::{Balance, Item};
use serenity::all::{GuildId, UserId};
use sqlx::PgPool;
use uuid::Uuid;

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
        // Fallback: check if the item actually exists and isn't expired
        let current_stock = sqlx::query_scalar!(
            r#"
            SELECT stock_remaining
            FROM economy_items
            WHERE guild_id = $1
              AND id = $2
              AND (expires_at IS NULL OR expires_at > NOW())
            "#,
            guild_id.get().cast_signed(),
            item_id,
        )
        .fetch_optional(&mut *tx)
        .await?;

        return current_stock.map_or_else(
            || Ok(Err(PurchaseError::ItemNotFoundOrExpired)),
            |stock| Ok(Err(PurchaseError::InsufficientStock { remaining: stock })),
        );
    };

    let Some(total_cost) = item.price.checked_mul(i64::from(quantity)) else {
        return Ok(Err(PurchaseError::InvalidQuantity)); // Overflow protection
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
    .fetch_optional(&mut **tx)
    .await
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
    let row = sqlx::query!(
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

    Ok(Balance::from_raw(
        row.guild_id,
        row.user_id,
        row.cash,
        row.bank,
    ))
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
