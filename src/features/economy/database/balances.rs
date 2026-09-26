use crate::features::economy::types::Balance;
use serenity::all::{GuildId, UserId};
use sqlx::{PgPool, PgTransaction};
use tracing::{debug, info, warn};

#[derive(sqlx::FromRow)]
struct RawBalance {
    guild_id: i64,
    user_id: i64,
    cash: i64,
    bank: i64,
}

/// Records a mutation committed by the calling function. Every balance change in this file goes
/// through one of these three helpers.
fn log_committed(op: &'static str, balance: &Balance, amount: i64) {
    info!(
        op,
        guild_id = %balance.guild_id,
        user_id = %balance.user_id,
        amount,
        cash_after = balance.cash,
        bank_after = balance.bank,
        "economy: balance mutated"
    );
}

/// Records a refused mutation. The `reason` matters because the guarded `UPDATE`s return `None`
/// for both a non-positive amount and insufficient funds.
fn log_rejected(
    op: &'static str,
    guild_id: GuildId,
    user_id: UserId,
    amount: i64,
    reason: &'static str,
) {
    debug!(
        op,
        %guild_id,
        %user_id,
        amount,
        reason,
        "economy: balance mutation rejected"
    );
}

/// Records a mutation inside a caller-owned transaction. `debug!` because the transaction may
/// still roll back. The caller logs it for real once it commits.
fn log_staged(op: &'static str, balance: &Balance, amount: i64) {
    debug!(
        op,
        guild_id = %balance.guild_id,
        user_id = %balance.user_id,
        amount,
        cash_after = balance.cash,
        bank_after = balance.bank,
        "economy: balance mutation staged (uncommitted)"
    );
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

/// Gets someone's balance.
///
/// # Errors
/// Returns [`Err`] if any database operation fails.
pub async fn get_balance(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<Balance, sqlx::Error> {
    let row = sqlx::query_as!(
        RawBalance,
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

    Ok(row.map_or_else(
        || Balance {
            guild_id,
            user_id,
            cash: 0,
            bank: 0,
        },
        Into::into,
    ))
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

    let row = sqlx::query_as!(
        RawBalance,
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
        Ok(r.into())
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

    // `warn!`: overwrites both wallets rather than moving a known amount.
    warn!(
        %guild_id,
        %user_id,
        cash,
        bank,
        "economy: balance overwritten (blind set of cash and bank)"
    );

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
    .fetch_one(db)
    .await?;

    let balance: Balance = row.into();
    log_committed("add_cash", &balance, amount);
    Ok(balance)
}

pub async fn transfer_cash_to_bank(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    amount: i64,
) -> Result<Option<Balance>, sqlx::Error> {
    if amount <= 0 {
        log_rejected(
            "transfer_cash_to_bank",
            guild_id,
            user_id,
            amount,
            "non_positive_amount",
        );
        return Ok(None);
    }

    let row = sqlx::query_as!(
        RawBalance,
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

    Ok(row.map_or_else(
        || {
            log_rejected(
                "transfer_cash_to_bank",
                guild_id,
                user_id,
                amount,
                "insufficient_cash",
            );
            None
        },
        |r| {
            let balance: Balance = r.into();
            log_committed("transfer_cash_to_bank", &balance, amount);
            Some(balance)
        },
    ))
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
        log_rejected(
            "deduct_cash",
            guild_id,
            user_id,
            amount,
            "non_positive_amount",
        );
        return Ok(None);
    }

    let row = sqlx::query_as!(
        RawBalance,
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

    Ok(row.map_or_else(
        || {
            log_rejected(
                "deduct_cash",
                guild_id,
                user_id,
                amount,
                "insufficient_cash",
            );
            None
        },
        |r| {
            let balance: Balance = r.into();
            log_committed("deduct_cash", &balance, amount);
            Some(balance)
        },
    ))
}

pub async fn transfer_bank_to_cash(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
    amount: i64,
) -> Result<Option<Balance>, sqlx::Error> {
    if amount <= 0 {
        log_rejected(
            "transfer_bank_to_cash",
            guild_id,
            user_id,
            amount,
            "non_positive_amount",
        );
        return Ok(None);
    }

    let row = sqlx::query_as!(
        RawBalance,
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

    Ok(row.map_or_else(
        || {
            log_rejected(
                "transfer_bank_to_cash",
                guild_id,
                user_id,
                amount,
                "insufficient_bank",
            );
            None
        },
        |r| {
            let balance: Balance = r.into();
            log_committed("transfer_bank_to_cash", &balance, amount);
            Some(balance)
        },
    ))
}

/// Set a user's wallet to an exact amount (admin). Preserves bank.
pub async fn set_cash(
    db: &PgPool,
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
            cash = EXCLUDED.cash
        RETURNING guild_id, user_id, cash, bank
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        amount,
    )
    .fetch_one(db)
    .await?;

    let balance: Balance = row.into();
    // `warn!`: an admin overwrite can erase the evidence of an exploit.
    warn!(
        op = "set_cash",
        %guild_id,
        %user_id,
        amount,
        cash_after = balance.cash,
        "economy: cash balance overwritten"
    );
    Ok(balance)
}

pub async fn get_leaderboard(
    db: &PgPool,
    guild_id: GuildId,
    limit: i64,
    offset: i64,
) -> Result<Vec<Balance>, sqlx::Error> {
    let rows = sqlx::query_as!(
        RawBalance,
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

    Ok(rows.into_iter().map(Into::into).collect())
}

pub async fn get_leaderboard_paginated(
    db: &PgPool,
    guild_id: GuildId,
    current_lowest_total: i64,
    limit: i64,
) -> Result<Vec<Balance>, sqlx::Error> {
    let rows = sqlx::query_as!(
        RawBalance,
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

    Ok(rows.into_iter().map(Into::into).collect())
}

pub async fn transfer_cash(
    db: &PgPool,
    guild_id: GuildId,
    from_user: UserId,
    to_user: UserId,
    amount: i64,
) -> Result<Option<(Balance, Balance)>, sqlx::Error> {
    if amount <= 0 || from_user == to_user {
        log_rejected(
            "transfer_cash",
            guild_id,
            from_user,
            amount,
            if amount <= 0 {
                "non_positive_amount"
            } else {
                "self_transfer"
            },
        );
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

    let sender_row = sqlx::query_as!(
        RawBalance,
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
        log_rejected(
            "transfer_cash",
            guild_id,
            from_user,
            amount,
            "insufficient_cash",
        );
        return Ok(None);
    };

    let receiver_row = sqlx::query_as!(
        RawBalance,
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

    let (sender, receiver) = (s.into(), receiver_row.into());
    log_committed("transfer_cash_out", &sender, amount);
    log_committed("transfer_cash_in", &receiver, amount);
    Ok(Some((sender, receiver)))
}

/// Fetch balance within an active transaction / connection.
pub async fn get_balance_tx(
    tx: &mut PgTransaction<'_>,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<Balance, sqlx::Error> {
    let row = sqlx::query_as!(
        RawBalance,
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
        Into::into,
    ))
}

/// Add cash to a user's wallet within a transaction (upserts if missing).
pub async fn add_cash_tx(
    tx: &mut PgTransaction<'_>,
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

    let balance: Balance = row.into();
    log_staged("add_cash_tx", &balance, amount);
    Ok(balance)
}

/// Deduct cash within a transaction. Returns `None` if insufficient funds.
pub async fn deduct_cash_tx(
    tx: &mut PgTransaction<'_>,
    guild_id: GuildId,
    user_id: UserId,
    amount: i64,
) -> Result<Option<Balance>, sqlx::Error> {
    if amount <= 0 {
        log_rejected(
            "deduct_cash_tx",
            guild_id,
            user_id,
            amount,
            "non_positive_amount",
        );
        return Ok(None);
    }

    let row = sqlx::query_as!(
        RawBalance,
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

    Ok(row.map_or_else(
        || {
            log_rejected(
                "deduct_cash_tx",
                guild_id,
                user_id,
                amount,
                "insufficient_cash",
            );
            None
        },
        |r| {
            let balance: Balance = r.into();
            log_staged("deduct_cash_tx", &balance, amount);
            Some(balance)
        },
    ))
}

/// Set a user's exact cash balance within a transaction.
pub async fn set_cash_tx(
    tx: &mut PgTransaction<'_>,
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
            cash = EXCLUDED.cash
        RETURNING guild_id, user_id, cash, bank
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
        amount,
    )
    .fetch_one(&mut **tx)
    .await?;

    let balance: Balance = row.into();
    log_staged("set_cash_tx", &balance, amount);
    Ok(balance)
}
