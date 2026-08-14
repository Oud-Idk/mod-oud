use sqlx::{PgPool, Postgres, Transaction};

pub async fn upsert_invited_member(
    tx: &mut Transaction<'_, Postgres>,
    guild_id: u64,
    member_id: i64,
    inviter_id: i64,
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
        guild_id.cast_signed(), member_id, inviter_id, invite_code,
    )
        .execute(&mut **tx)
        .await?;
    Ok(())
}

pub async fn get_inviter_count(
    tx: &mut Transaction<'_, Postgres>,
    guild_id: u64,
    inviter_id: i64,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        "SELECT count FROM inviter_counts WHERE guild_id = $1 AND inviter_id = $2",
        guild_id.cast_signed(), inviter_id,
    )
        .fetch_one(&mut **tx)
        .await
}

pub async fn attribute_join(
    db: &PgPool,
    guild_id: u64,
    member_id: i64,
    inviter_id: i64,
    invite_code: &str,
) -> Result<i64, sqlx::Error> {
    let mut tx = db.begin().await?;
    upsert_invited_member(&mut tx, guild_id, member_id, inviter_id, invite_code).await?;
    let new_count = get_inviter_count(&mut tx, guild_id, inviter_id).await?;
    tx.commit().await?;
    Ok(new_count)
}