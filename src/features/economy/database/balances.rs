use crate::features::economy::types::Balance;
use serenity::all::{GuildId, UserId};
use sqlx::{PgPool, PgTransaction};

/// Gets someone's balance.
///
/// # Errors
/// Returns [`Err`] if any database operation fails.
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

    row.map_or_else(
        || {
            Ok(Balance {
                guild_id,
                user_id,
                cash: 0,
                bank: 0,
            })
        },
        |r| Ok(Balance::from_raw(r.guild_id, r.user_id, r.cash, r.bank)),
    )
}

/// Ensure a balance row exists, seeding with `starting_balance` if missing.
/// Returns the current balance (existing or newly seeded).
///
/// # Errors
/// Returns [`Err`] if database operation fails.
pub async fn ensure_balance(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    starting_balance: i64,
) -> Result<Balance, sqlx::Error> {
    if starting_balance <= 0 {
        return get_balance(db, guild_id, user_id).await;
    }

    let row = sqlx::query!(
        r#"
        INSERT INTO economy_balances (guild_id, user_id, cash, bank)
        VALUES ($1, $2, $3, 0)
        ON CONFLICT (guild_id, user_id) DO NOTHING
        RETURNING guild_id, user_id, cash, bank
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        starting_balance,
    )
    .fetch_optional(db)
    .await?;

    if let Some(r) = row {
        Ok(Balance::from_raw(r.guild_id, r.user_id, r.cash, r.bank))
    } else {
        get_balance(db, guild_id, user_id).await
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

/// Adds cash to someone's wallet.
///
/// # Errors
/// Returns [`Err`] if any database operation fails.
pub async fn add_cash(
    db: &PgPool,
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
    if amount <= 0 {
        return Ok(None);
    }

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

/// Deduct coins from a user's wallet. Returns the updated balance, or
/// `None` if the user has insufficient funds.
///
/// # Errors
/// Returns [`Err`] if database operation fails.
pub async fn deduct_cash(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    amount: i64,
) -> Result<Option<Balance>, sqlx::Error> {
    if amount <= 0 {
        return Ok(None);
    }

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
    if amount <= 0 {
        return Ok(None);
    }

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

/// Set a user's wallet to an exact amount (admin). Preserves bank.
pub async fn set_cash(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    amount: i64,
) -> Result<Balance, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        INSERT INTO economy_balances (guild_id, user_id, cash, bank)
        VALUES ($1, $2, $3, 0)
        ON CONFLICT (guild_id, user_id) DO UPDATE SET
            cash = EXCLUDED.cash
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

pub async fn get_leaderboard(
    db: &PgPool,
    guild_id: GuildId,
    limit: i64,
    offset: i64,
) -> Result<Vec<Balance>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"
        SELECT guild_id, user_id, cash, bank
        FROM economy_balances
        WHERE guild_id = $1
        ORDER BY (cash + bank) DESC, user_id ASC
        LIMIT $2 OFFSET $3
        "#,
        guild_id.get().cast_signed(),
        limit,
        offset,
    )
    .fetch_all(db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| Balance::from_raw(r.guild_id, r.user_id, r.cash, r.bank))
        .collect())
}

pub async fn get_leaderboard_paginated(
    db: &PgPool,
    guild_id: GuildId,
    current_lowest_total: i64,
    limit: i64,
) -> Result<Vec<Balance>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"
        SELECT guild_id, user_id, cash, bank
        FROM economy_balances
        WHERE guild_id = $1
          AND (cash + bank) < $2
        ORDER BY (cash + bank) DESC, user_id ASC
        LIMIT $3
        "#,
        guild_id.get().cast_signed(),
        current_lowest_total,
        limit,
    )
    .fetch_all(db)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| Balance::from_raw(r.guild_id, r.user_id, r.cash, r.bank))
        .collect())
}

pub async fn transfer_cash(
    db: &PgPool,
    guild_id: GuildId,
    from_user: UserId,
    to_user: UserId,
    amount: i64,
) -> Result<Option<(Balance, Balance)>, sqlx::Error> {
    if amount <= 0 || from_user == to_user {
        return Ok(None);
    }

    let mut tx = db.begin().await?;

    // Lock both rows deterministically by ID to prevent deadlocks from mutual transfers
    let (first_id, second_id) = if from_user.get() < to_user.get() {
        (from_user.get().cast_signed(), to_user.get().cast_signed())
    } else {
        (to_user.get().cast_signed(), from_user.get().cast_signed())
    };

    sqlx::query!(
        r#"
        SELECT user_id FROM economy_balances
        WHERE guild_id = $1 AND user_id IN ($2, $3)
        ORDER BY user_id
        FOR UPDATE
        "#,
        guild_id.get().cast_signed(),
        first_id,
        second_id,
    )
    .fetch_all(&mut *tx)
    .await?;

    let sender_row = sqlx::query!(
        r#"
        UPDATE economy_balances
        SET cash = cash - $3
        WHERE guild_id = $1 AND user_id = $2 AND cash >= $3
        RETURNING guild_id, user_id, cash, bank
        "#,
        guild_id.get().cast_signed(),
        from_user.get().cast_signed(),
        amount,
    )
    .fetch_optional(&mut *tx)
    .await?;

    let Some(s) = sender_row else {
        tx.rollback().await?;
        return Ok(None);
    };

    let receiver_row = sqlx::query!(
        r#"
        INSERT INTO economy_balances (guild_id, user_id, cash, bank)
        VALUES ($1, $2, $3, 0)
        ON CONFLICT (guild_id, user_id) DO UPDATE SET
            cash = economy_balances.cash + EXCLUDED.cash
        RETURNING guild_id, user_id, cash, bank
        "#,
        guild_id.get().cast_signed(),
        to_user.get().cast_signed(),
        amount,
    )
    .fetch_one(&mut *tx)
    .await?;

    tx.commit().await?;

    Ok(Some((
        Balance::from_raw(s.guild_id, s.user_id, s.cash, s.bank),
        Balance::from_raw(
            receiver_row.guild_id,
            receiver_row.user_id,
            receiver_row.cash,
            receiver_row.bank,
        ),
    )))
}

/// Fetch balance within an active transaction / connection.
pub async fn get_balance_tx(
    tx: &mut PgTransaction<'_>,
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
    .fetch_optional(&mut **tx)
    .await?;

    Ok(row.map_or_else(
        || Balance {
            guild_id,
            user_id,
            cash: 0,
            bank: 0,
        },
        |r| Balance::from_raw(r.guild_id, r.user_id, r.cash, r.bank),
    ))
}

/// Add cash to a user's wallet within a transaction (upserts if missing).
pub async fn add_cash_tx(
    tx: &mut PgTransaction<'_>,
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

/// Deduct cash within a transaction. Returns `None` if insufficient funds.
pub async fn deduct_cash_tx(
    tx: &mut PgTransaction<'_>,
    guild_id: GuildId,
    user_id: UserId,
    amount: i64,
) -> Result<Option<Balance>, sqlx::Error> {
    if amount <= 0 {
        return Ok(None);
    }

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
    .fetch_optional(&mut **tx)
    .await?;

    Ok(row.map(|r| Balance::from_raw(r.guild_id, r.user_id, r.cash, r.bank)))
}

/// Set a user's exact cash balance within a transaction.
pub async fn set_cash_tx(
    tx: &mut PgTransaction<'_>,
    guild_id: GuildId,
    user_id: UserId,
    amount: i64,
) -> Result<Balance, sqlx::Error> {
    let row = sqlx::query!(
        r#"
        INSERT INTO economy_balances (guild_id, user_id, cash, bank)
        VALUES ($1, $2, $3, 0)
        ON CONFLICT (guild_id, user_id) DO UPDATE SET
            cash = EXCLUDED.cash
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
