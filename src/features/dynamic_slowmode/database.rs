use crate::features::dynamic_slowmode::types::{MIN_EDIT_INTERVAL_SECS, SlowmodeChannelState};
use anyhow::{Context, Result};
use chrono::{DateTime, Utc};
use serenity::all::{ChannelId, GuildId};
use sqlx::PgPool;

/// Raw database representation of a dynamic slowmode channel row.
#[derive(sqlx::FromRow)]
struct RawSlowmodeChannel {
    channel_id: i64,
    guild_id: i64,
    pre_automation_secs: i16,
    last_written_secs: i16,
    last_edit_at: DateTime<Utc>,
    armed_at: DateTime<Utc>,
    disarmed_at: Option<DateTime<Utc>>,
    disarm_reason: Option<String>,
}

impl From<RawSlowmodeChannel> for SlowmodeChannelState {
    fn from(raw: RawSlowmodeChannel) -> Self {
        Self {
            channel_id: ChannelId::new(raw.channel_id.cast_unsigned()),
            guild_id: GuildId::new(raw.guild_id.cast_unsigned()),
            pre_automation_secs: raw.pre_automation_secs.cast_unsigned(),
            last_written_secs: raw.last_written_secs.cast_unsigned(),
            last_edit_at: raw.last_edit_at,
            armed_at: raw.armed_at,
            disarmed_at: raw.disarmed_at,
            disarm_reason: raw.disarm_reason,
        }
    }
}

/// # Errors
/// Returns `Err` if the query fails.
pub async fn fetch_state(
    db: &PgPool,
    channel_id: ChannelId,
) -> Result<Option<SlowmodeChannelState>> {
    sqlx::query_as!(
        RawSlowmodeChannel,
        "SELECT * FROM dynamic_slowmode_channels WHERE channel_id = $1",
        channel_id.get().cast_signed()
    )
    .fetch_optional(db)
    .await
    .map(|row| row.map(Into::into))
    .context("dynamic_slowmode_channels lookup failed")
}

/// Armed channels for one guild.
///
/// # Errors
/// Returns `Err` if the query fails.
pub async fn list_armed_for_guild(
    db: &PgPool,
    guild_id: GuildId,
) -> Result<Vec<SlowmodeChannelState>> {
    sqlx::query_as!(
        RawSlowmodeChannel,
        "SELECT * FROM dynamic_slowmode_channels
         WHERE guild_id = $1 AND disarmed_at IS NULL",
        guild_id.get().cast_signed()
    )
    .fetch_all(db)
    .await
    .map(|rows| rows.into_iter().map(Into::into).collect())
    .context("dynamic_slowmode_channels lookup failed")
}

/// Every channel row for a guild, armed or not. Used by the dashboard.
///
/// # Errors
/// Returns `Err` if the query fails.
pub async fn list_for_guild(db: &PgPool, guild_id: GuildId) -> Result<Vec<SlowmodeChannelState>> {
    sqlx::query_as!(
        RawSlowmodeChannel,
        "SELECT * FROM dynamic_slowmode_channels WHERE guild_id = $1 ORDER BY channel_id",
        guild_id.get().cast_signed()
    )
    .fetch_all(db)
    .await
    .map(|rows| rows.into_iter().map(Into::into).collect())
    .context("dynamic_slowmode_channels lookup failed")
}

/// Every channel that has a row, armed or not.
///
/// Lets the tick tell a channel it has never seen from one it deliberately stopped automating.
pub async fn list_tracked_channel_ids(db: &PgPool) -> Result<Vec<ChannelId>> {
    sqlx::query_scalar!("SELECT channel_id FROM dynamic_slowmode_channels")
        .fetch_all(db)
        .await
        .map(|ids| {
            ids.into_iter()
                .map(|id| ChannelId::new(id.cast_unsigned()))
                .collect()
        })
        .context("dynamic_slowmode_channels lookup failed")
}

/// Guilds whose dynamic slowmode policy is enabled.
///
/// The dashboard writes `guild_configs` directly, so the tick discovers such guilds here.
pub async fn list_enabled_guild_ids(db: &PgPool) -> Result<Vec<GuildId>> {
    sqlx::query_scalar!(
        "SELECT guild_id FROM guild_configs
         WHERE settings -> 'dynamic_slowmode' ->> 'enabled' = 'true'"
    )
    .fetch_all(db)
    .await
    .map(|ids| {
        ids.into_iter()
            .map(|id| GuildId::new(id.cast_unsigned()))
            .collect()
    })
    .context("guild_configs slowmode policy lookup failed")
}

/// Every armed channel, across guilds. Used by the startup reconcile.
///
/// # Errors
/// Returns `Err` if the query fails.
pub async fn list_all_armed(db: &PgPool) -> Result<Vec<SlowmodeChannelState>> {
    sqlx::query_as!(
        RawSlowmodeChannel,
        "SELECT * FROM dynamic_slowmode_channels WHERE disarmed_at IS NULL"
    )
    .fetch_all(db)
    .await
    .map(|rows| rows.into_iter().map(Into::into).collect())
    .context("dynamic_slowmode_channels lookup failed")
}

/// Arms a channel without writing to it yet.
///
/// Backdates `last_edit_at` so arming does not consume the pacing budget; arming is not an edit.
pub async fn arm(
    db: &PgPool,
    channel_id: ChannelId,
    guild_id: GuildId,
    pre_automation_secs: u16,
) -> Result<()> {
    sqlx::query!(
        r#"
        INSERT INTO dynamic_slowmode_channels (
            channel_id, guild_id, pre_automation_secs, last_written_secs, last_edit_at
        )
        VALUES ($1, $2, $3, $3, NOW() - ($4::bigint * INTERVAL '1 second'))
        ON CONFLICT (channel_id) DO UPDATE SET
            pre_automation_secs = EXCLUDED.pre_automation_secs,
            last_written_secs = EXCLUDED.last_written_secs,
            armed_at = NOW(),
            last_edit_at = NOW() - ($4::bigint * INTERVAL '1 second'),
            disarmed_at = NULL,
            disarm_reason = NULL
        "#,
        channel_id.get().cast_signed(),
        guild_id.get().cast_signed(),
        i16::try_from(pre_automation_secs).unwrap_or(i16::MAX),
        MIN_EDIT_INTERVAL_SECS,
    )
    .execute(db)
    .await
    .context("dynamic_slowmode_channels arm failed")?;

    Ok(())
}

/// Records a value the bot just wrote, which is also what paces the next edit.
///
/// # Errors
/// Returns `Err` if the update fails.
pub async fn record_write(
    db: &PgPool,
    channel_id: ChannelId,
    guild_id: GuildId,
    pre_automation_secs: u16,
    written_secs: u16,
    at: DateTime<Utc>,
) -> Result<()> {
    sqlx::query!(
        r#"
        INSERT INTO dynamic_slowmode_channels (
            channel_id, guild_id, pre_automation_secs, last_written_secs, last_edit_at
        )
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (channel_id) DO UPDATE SET
            last_written_secs = EXCLUDED.last_written_secs,
            last_edit_at = EXCLUDED.last_edit_at
        "#,
        channel_id.get().cast_signed(),
        guild_id.get().cast_signed(),
        i16::try_from(pre_automation_secs).unwrap_or(i16::MAX),
        i16::try_from(written_secs).unwrap_or(i16::MAX),
        at,
    )
    .execute(db)
    .await
    .context("dynamic_slowmode_channels write record failed")?;

    Ok(())
}

/// Stops automating a channel without forgetting its snapshot.
///
/// # Errors
/// Returns `Err` if the update fails.
pub async fn disarm(db: &PgPool, channel_id: ChannelId, reason: &str) -> Result<()> {
    sqlx::query!(
        "UPDATE dynamic_slowmode_channels
         SET disarmed_at = NOW(), disarm_reason = $2
         WHERE channel_id = $1 AND disarmed_at IS NULL",
        channel_id.get().cast_signed(),
        reason,
    )
    .execute(db)
    .await
    .context("dynamic_slowmode_channels disarm failed")?;

    Ok(())
}

/// Drops the row entirely, used when a channel leaves the policy.
///
/// # Errors
/// Returns `Err` if the delete fails.
pub async fn forget(db: &PgPool, channel_id: ChannelId) -> Result<()> {
    sqlx::query!(
        "DELETE FROM dynamic_slowmode_channels WHERE channel_id = $1",
        channel_id.get().cast_signed()
    )
    .execute(db)
    .await
    .context("dynamic_slowmode_channels delete failed")?;

    Ok(())
}
