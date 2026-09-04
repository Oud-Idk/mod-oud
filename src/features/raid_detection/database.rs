use crate::features::raid_detection::snapshot::PreRaidState;
use crate::features::raid_detection::types::RaidEventType;
use serenity::all::GuildId;
use sqlx::PgPool;

#[derive(sqlx::FromRow)]
struct RawRaidGuild {
    guild_id: i64,
}

impl From<RawRaidGuild> for GuildId {
    fn from(row: RawRaidGuild) -> Self {
        Self::new(row.guild_id.cast_unsigned())
    }
}

#[derive(sqlx::FromRow)]
struct RawActiveRaidState {
    pre_raid_snapshot: serde_json::Value,
}

pub async fn bump_verification_to_max(
    pool: &PgPool,
    guild_id: GuildId,
) -> Result<u64, sqlx::Error> {
    // Writes both the top-level `verification` key and the legacy
    // `welcome.verification` nesting; each branch only fires where that path
    // exists so partially migrated rows are never stubbed into existence.
    let top_level = sqlx::query!(
        r#"
        UPDATE guild_configs
        SET settings = jsonb_set(
            jsonb_set(
                settings,
                '{verification,useOauth}',
                to_jsonb($2::bool),
                false
            ),
            '{verification,captchaType}',
            to_jsonb($3::text),
            false
        )
        WHERE guild_id = $1
          AND settings #> '{verification}' IS NOT NULL;
        "#,
        guild_id.get().cast_signed(),
        true,
        "HCAPTCHA"
    )
    .execute(pool)
    .await?
    .rows_affected();

    let legacy = sqlx::query!(
        r#"
        UPDATE guild_configs
        SET settings = jsonb_set(
            jsonb_set(
                settings,
                '{welcome,verification,useOauth}',
                to_jsonb($2::bool),
                false
            ),
            '{welcome,verification,captchaType}',
            to_jsonb($3::text),
            false
        )
        WHERE guild_id = $1
          AND settings #> '{welcome,verification}' IS NOT NULL;
        "#,
        guild_id.get().cast_signed(),
        true,
        "HCAPTCHA"
    )
    .execute(pool)
    .await?
    .rows_affected();

    Ok(top_level + legacy)
}

pub async fn restore_verification_settings(
    pool: &PgPool,
    guild_id: GuildId,
    use_oauth: Option<bool>,
    captcha_type: Option<&str>,
) -> Result<u64, sqlx::Error> {
    // Restores both the top-level `verification` key and the legacy
    // `welcome.verification` nesting; each branch only fires where that path
    // exists so partially migrated rows are never stubbed into existence.
    let top_level = sqlx::query!(
        r#"
        UPDATE guild_configs
        SET settings = jsonb_set(
            jsonb_set(
                settings,
                '{verification,useOauth}',
                COALESCE(to_jsonb($2::bool), 'null'::jsonb),
                true
            ),
            '{verification,captchaType}',
            COALESCE(to_jsonb($3::text), 'null'::jsonb),
            true
        )
        WHERE guild_id = $1
          AND settings #> '{verification}' IS NOT NULL;
        "#,
        guild_id.get().cast_signed(),
        use_oauth,
        captcha_type
    )
    .execute(pool)
    .await?
    .rows_affected();

    let legacy = sqlx::query!(
        r#"
        UPDATE guild_configs
        SET settings = jsonb_set(
            jsonb_set(
                settings,
                '{welcome,verification,useOauth}',
                COALESCE(to_jsonb($2::bool), 'null'::jsonb),
                true
            ),
            '{welcome,verification,captchaType}',
            COALESCE(to_jsonb($3::text), 'null'::jsonb),
            true
        )
        WHERE guild_id = $1
          AND settings #> '{welcome,verification}' IS NOT NULL;
        "#,
        guild_id.get().cast_signed(),
        use_oauth,
        captcha_type
    )
    .execute(pool)
    .await?
    .rows_affected();

    Ok(top_level + legacy)
}

// ── Active raid state ────────────────────────────────────────────────

pub async fn save_active_raid_state(
    pool: &PgPool,
    guild_id: GuildId,
    snapshot: &PreRaidState,
) -> Result<(), sqlx::Error> {
    let snapshot_json =
        serde_json::to_value(snapshot).map_err(|e| sqlx::Error::Decode(Box::new(e)))?;

    sqlx::query!(
        r#"
        INSERT INTO raid_active_state (guild_id, raid_start_time, pre_raid_snapshot)
        VALUES ($1, $2, $3)
        ON CONFLICT (guild_id) DO UPDATE SET
            raid_start_time = EXCLUDED.raid_start_time,
            pre_raid_snapshot = EXCLUDED.pre_raid_snapshot
        "#,
        guild_id.get().cast_signed(),
        snapshot.raid_start_time,
        snapshot_json,
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn load_active_raid_state(
    pool: &PgPool,
    guild_id: GuildId,
) -> Result<Option<PreRaidState>, sqlx::Error> {
    let row = sqlx::query_as!(
        RawActiveRaidState,
        r#"
        SELECT pre_raid_snapshot
        FROM raid_active_state
        WHERE guild_id = $1
        "#,
        guild_id.get().cast_signed(),
    )
    .fetch_optional(pool)
    .await?;

    match row {
        Some(r) => {
            let snapshot: PreRaidState = serde_json::from_value(r.pre_raid_snapshot)
                .map_err(|e| sqlx::Error::Decode(Box::new(e)))?;
            Ok(Some(snapshot))
        }
        None => Ok(None),
    }
}

pub async fn delete_active_raid_state(pool: &PgPool, guild_id: GuildId) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        DELETE FROM raid_active_state
        WHERE guild_id = $1
        "#,
        guild_id.get().cast_signed(),
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn get_all_active_raid_guilds(pool: &PgPool) -> Result<Vec<GuildId>, sqlx::Error> {
    let rows = sqlx::query_as!(
        RawRaidGuild,
        r#"
        SELECT guild_id
        FROM raid_active_state
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows.into_iter().map(Into::into).collect())
}

pub async fn upsert_hourly_stats(
    pool: &PgPool,
    guild_ids: &[GuildId],
    hour_keys: &[String],
    join_counts: &[i64],
) -> Result<(), sqlx::Error> {
    let raw_guild_ids: Vec<i64> = guild_ids.iter().map(|&id| id.get().cast_signed()).collect();

    sqlx::query!(
        r#"
        INSERT INTO raid_hourly_stats (guild_id, hour_key, join_count)
        SELECT * FROM UNNEST(
            $1::bigint[],
            $2::text[],
            $3::bigint[]
        )
        ON CONFLICT (guild_id, hour_key) DO UPDATE SET
            join_count = raid_hourly_stats.join_count + EXCLUDED.join_count
        "#,
        &raw_guild_ids,
        hour_keys,
        join_counts,
    )
    .execute(pool)
    .await?;

    Ok(())
}

pub async fn log_raid_event(
    pool: &PgPool,
    guild_id: GuildId,
    event_type: RaidEventType,
    details: Option<serde_json::Value>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"
        INSERT INTO raid_event_logs (guild_id, event_type, details)
        VALUES ($1, $2, $3)
        "#,
        guild_id.get().cast_signed(),
        event_type as RaidEventType,
        details,
    )
    .execute(pool)
    .await?;

    Ok(())
}
