use crate::shared::ok_or_none;
use crate::features::automod::{HoneypotConfig, MessageFilteringConfig};
use crate::features::invite_tracking::InviteTrackerConfig;
use crate::features::join_leave::{LeaveConfig, WelcomeConfig};
use crate::features::leveling::LevelingConfig;
use crate::features::member_counter::MemberCounterConfig;
use crate::features::message_logging::MessageLoggingConfig;
use crate::features::reporting::ReportConfig;
use crate::features::tickets::TicketConfig;
use crate::shared::embed::{DiscordEmbed, Format};
use fred::clients::Client;
use fred::interfaces::FredResult;
use fred::prelude::{Expiration, KeysInterface};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use tracing::{debug, error, trace, warn};
use anyhow::Context;
use crate::features::birthday::BirthdayConfig;
use crate::features::raid_detection::RaidDetectionConfig;

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
// #[serde(rename_all = "camelCase")]
pub struct GuildSettings {
    pub welcome: Option<WelcomeConfig>,
    pub leave: Option<LeaveConfig>,
    pub message_logging: Option<MessageLoggingConfig>,
    pub message_filtering: Option<MessageFilteringConfig>,
    pub report: Option<ReportConfig>,
    pub moderation_dms: Option<ModerationDMsConfig>,
    pub leveling: Option<LevelingConfig>,
    pub tickets: Option<TicketConfig>,
    pub invite_tracker: Option<InviteTrackerConfig>,
    pub honeypot: Option<HoneypotConfig>,
    pub member_counter: Option<MemberCounterConfig>,
    pub birthday: Option<BirthdayConfig>,
    pub raid_detection: Option<RaidDetectionConfig>
}

impl GuildSettings {
    pub fn is_message_logging_enabled(&self) -> bool {
        self.message_logging
            .as_ref()
            .and_then(|l| l.events.as_ref())
            .map_or(false, |e| {
                e.message_delete.unwrap_or(false) || e.message_edit.unwrap_or(false)
            })
    }
}


/// Retrieves settings. Returns a default struct if none exists in the DB.
pub async fn get_settings_inner(
    db: &PgPool,
    redis: &Client,
    cache: &moka::future::Cache<i64, GuildSettings>,
    guild_id: i64,
) -> anyhow::Result<GuildSettings> {
    if let Some(settings) = cache.get(&guild_id).await {
        trace!(guild_id, "Retrieved settings from memory cache");
        return Ok(settings);
    }

    let cache_key = format!("config:guild:{}", guild_id);

    if let Some(settings) = get_settings_from_redis(redis, &cache_key, guild_id).await {
        cache.insert(guild_id, settings.clone()).await;
        return Ok(settings);
    }

    debug!(guild_id, key = %cache_key, "Settings cache miss; querying DB");

    let settings_db = get_settings_from_database(db, guild_id)
        .await
        .with_context(|| format!("Failed to query settings from DB for guild_id {guild_id}"))?;

    let settings: GuildSettings = match settings_db {
        Some(raw_json) => {
            match serde_path_to_error::deserialize::<_, GuildSettings>(raw_json.clone()) {
                Ok(s) => {
                    debug!(guild_id, "Found config from DB.");
                    s
                }
                Err(err) => {
                    let path = err.path().to_string(); // e.g. "member_counter.counters[0].id"
                    let inner_error = err.into_inner(); // The actual Serde error

                    error!(
                    error = %inner_error,
                    field_path = %path,
                    guild_id,
                    raw_json = %raw_json,
                    "Failed to deserialize database JSON; falling back to default settings"
                );
                    GuildSettings::default()
                }
            }
        }
        None => {
            trace!(guild_id, "No config found in database; using default settings");
            GuildSettings::default()
        }
    };

    if let Err(e) = set_setting_to_redis(redis, &settings, &cache_key).await {
        warn!(
            error = %e,
            guild_id,
            key = %cache_key,
            "Failed to write settings to Redis cache"
        );
    }

    cache.insert(guild_id, settings.clone()).await;

    Ok(settings)
}

pub async fn get_settings_from_database(
    db: &PgPool,
    guild_id: i64
) -> anyhow::Result<Option<serde_json::Value>> {
    let row = sqlx::query!(
        "SELECT settings FROM guild_configs WHERE guild_id = $1",
        guild_id
    )
        .fetch_optional(db)
        .await?;

    Ok(row.map(|r| r.settings))
}

pub async fn get_settings_from_redis(
    redis: &Client,
    cache_key: &str,
    guild_id: i64,
) -> Option<GuildSettings> {
    let cached_string: String = redis.get(cache_key).await.ok()?;

    match serde_json::from_str::<GuildSettings>(&cached_string) {
        Ok(settings) => {
            trace!(guild_id, key = %cache_key, "Retrieved settings from Redis cache");
            Some(settings)
        }
        Err(e) => {
            warn!(
                error = ?e,
                guild_id,
                key = %cache_key,
                "Failed to parse settings from Redis; falling back to DB"
            );
            None
        }
    }
}

pub async fn set_setting_to_redis(redis: &Client, settings: &GuildSettings, cache_key: &str) -> FredResult<()> {
    match serde_json::to_string(&settings) {
        Ok(serialized) => {
            redis
                .set(
                    cache_key,
                    serialized,
                    Some(Expiration::EX(3600)),
                    None,
                    false,
                )
                .await
        }
        Err(err) => {
            warn!("Failed to serialize settings for key {}: {}. Skipping.", cache_key, err);
            Ok(())
        }
    }
}

pub async fn get_settings(
    db: &PgPool,
    redis: &Client,
    cache: &moka::future::Cache<i64, GuildSettings>,
    guild_id: i64,
) -> anyhow::Result<GuildSettings> {
    Box::pin(get_settings_inner(db, redis, cache, guild_id)).await
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct MessageLayout {
    pub enabled: bool,
    pub format: Format,
    pub content: String,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub embed: Option<DiscordEmbed>,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModerationDMsConfig {
    #[serde(default, deserialize_with = "ok_or_none")]
    pub warn: Option<MessageLayout>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub pardon_warn: Option<MessageLayout>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub unpardon_warn: Option<MessageLayout>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub unpardon_delete_warn: Option<MessageLayout>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub mute: Option<MessageLayout>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub unmute: Option<MessageLayout>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub kick: Option<MessageLayout>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub ban: Option<MessageLayout>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub softban: Option<MessageLayout>,
    #[serde(default, deserialize_with = "ok_or_none")]
    pub honeypot: Option<MessageLayout>,
}