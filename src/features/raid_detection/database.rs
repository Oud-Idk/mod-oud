use crate::features::raid_detection::snapshot::PreRaidState;
use crate::features::raid_detection::types::RaidEventType;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serenity::all::GuildId;
use sqlx::PgPool;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersistedRaidState {
    pub guild_id: i64,
    pub raid_start_time: DateTime<Utc>,
    pub snapshot: PreRaidState,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RaidEventDetail {
    pub action: String,
    pub details: Option<serde_json::Value>,
}

#[derive(Debug, sqlx::FromRow)]
pub struct HourlyStatRow {
    pub hour_key: String,
    pub join_count: i64,
}

// ── Verification bump/restore (existing) ─────────────────────────────

pub async fn bump_verification_to_max(
    pool: &PgPool,
    guild_id: GuildId,
) -> Result<u64, sqlx::Error> {
    let rows_affected = sqlx::query!(
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

    Ok(rows_affected)
}

pub async fn restore_verification_settings(
    pool: &PgPool,
    guild_id: GuildId,
    use_oauth: Option<bool>,
    captcha_type: Option<&str>,
) -> Result<u64, sqlx::Error> {
    let rows_affected = sqlx::query!(
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

    Ok(rows_affected)
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
    let row = sqlx::query!(
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
    let rows = sqlx::query!(
        r#"
        SELECT guild_id
        FROM raid_active_state
        "#,
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| GuildId::new(r.guild_id.cast_unsigned()))
        .collect())
}

// ── Hourly stats ─────────────────────────────────────────────────────

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

pub async fn load_hourly_stats_history(
    pool: &PgPool,
    guild_id: GuildId,
    hours: i64,
) -> Result<Vec<HourlyStatRow>, sqlx::Error> {
    let rows = sqlx::query!(
        r#"
        SELECT hour_key, join_count
        FROM raid_hourly_stats
        WHERE guild_id = $1
          AND hour_key >= to_char(NOW() - ($2 || ' hours')::interval, 'YYYYMMDDHH')
        ORDER BY hour_key DESC
        "#,
        guild_id.get().cast_signed(),
        hours.to_string(),
    )
    .fetch_all(pool)
    .await?;

    Ok(rows
        .into_iter()
        .map(|r| HourlyStatRow {
            hour_key: r.hour_key,
            join_count: r.join_count,
        })
        .collect())
}

pub async fn prune_old_hourly_stats(pool: &PgPool, days: i64) -> Result<u64, sqlx::Error> {
    let result = sqlx::query!(
        r#"
        DELETE FROM raid_hourly_stats
        WHERE hour_key < to_char(NOW() - ($1 || ' days')::interval, 'YYYYMMDDHH')
        "#,
        days.to_string(),
    )
    .execute(pool)
    .await?;

    Ok(result.rows_affected())
}

// ── Event logs ───────────────────────────────────────────────────────

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
