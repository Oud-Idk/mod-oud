use anyhow::Context;
use chrono::{DateTime, Utc};
use serenity::{
    all::{GuildId, Member},
    model::id::UserId,
};
use sqlx::{PgPool, Postgres, Transaction};

pub async fn upsert_invited_member(
    tx: &mut Transaction<'_, Postgres>,
    guild_id: u64,
    member_id: u64,
    inviter_id: u64,
    invite_code: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO invited_members (guild_id, member_id, inviter_id, invite_code)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (guild_id, member_id) DO UPDATE
            SET inviter_id  = EXCLUDED.inviter_id,
                invite_code = EXCLUDED.invite_code,
                created_at  = now()
        "#,
        guild_id.cast_signed(),
        member_id.cast_signed(),
        inviter_id.cast_signed(),
        invite_code,
    )
    .execute(&mut **tx)
    .await?;
    Ok(())
}

pub async fn get_inviter_count(
    tx: &mut Transaction<'_, Postgres>,
    guild_id: u64,
    inviter_id: u64,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT count FROM inviter_counts WHERE guild_id = $1 AND inviter_id = $2",
        guild_id.cast_signed(),
        inviter_id.cast_signed(),
    )
    .fetch_one(&mut **tx)
    .await
}

pub async fn attribute_join(
    db: &PgPool,
    guild_id: u64,
    member_id: u64,
    inviter_id: u64,
    invite_code: &str,
) -> Result<u64, sqlx::Error> {
    let mut tx = db.begin().await?;
    upsert_invited_member(&mut tx, guild_id, member_id, inviter_id, invite_code).await?;
    let new_count = get_inviter_count(&mut tx, guild_id, inviter_id).await?;
    tx.commit().await?;
    Ok(new_count.cast_unsigned())
}

#[derive(sqlx::FromRow)]
pub struct SimpleInviterDetails {
    pub inviter_id: i64,
    pub invite_code: String,
    pub created_at: DateTime<Utc>,
}

pub async fn get_inviter_details(
    db: &PgPool,
    guild_id: GuildId,
    member: &Member,
) -> anyhow::Result<Option<SimpleInviterDetails>> {
    sqlx::query_as!(
        SimpleInviterDetails,
        r#"
        SELECT inviter_id, invite_code, created_at
        FROM invited_members
        WHERE guild_id = $1 AND member_id = $2
        "#,
        guild_id.get().cast_signed(),
        member.user.id.get().cast_signed(),
    )
    .fetch_optional(db)
    .await
    .context("Failed to fetch inviter details")
}

pub struct InviterLeaderboardEntry {
    pub inviter_id: UserId,
    pub count: i64,
}

/// Fetch total invite count for a specific user
pub async fn get_user_invite_count(
    db: &PgPool,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<i64, sqlx::Error> {
    let count = sqlx::query_scalar!(
        r#"
        SELECT count
        FROM inviter_counts
        WHERE guild_id = $1 AND inviter_id = $2
        "#,
        guild_id.get().cast_signed(),
        user_id.get().cast_signed(),
    )
    .fetch_optional(db)
    .await?;

    Ok(count.unwrap_or(0))
}

/// Fetch top inviters with at least 1 invite
pub async fn get_top_inviters(
    db: &PgPool,
    guild_id: GuildId,
    limit: i64,
) -> Result<Vec<InviterLeaderboardEntry>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"
        SELECT inviter_id, count
        FROM inviter_counts
        WHERE guild_id = $1 AND count > 0
        ORDER BY count DESC
        LIMIT $2
        "#,
        guild_id.get().cast_signed(),
        limit,
    )
    .fetch_all(db)
    .await?;

    // Convert raw signed integer DB snowflakes directly into serenity `UserId`
    let entries = rows
        .into_iter()
        .map(|row| InviterLeaderboardEntry {
            inviter_id: UserId::new(row.inviter_id.cast_unsigned()),
            count: row.count,
        })
        .collect();

    Ok(entries)
}
