use crate::core::config::keys::guild_config_key;
use crate::core::config::message_layout::TogglableMessage;
use crate::core::config::{database, keys, redis};
use crate::features::automod::{HoneypotConfig, MessageFilteringConfig};
use crate::features::birthday::BirthdayConfig;
use crate::features::invite_tracking::InviteTrackerConfig;
use crate::features::join_leave::{LeaveConfig, WelcomeConfig};
use crate::features::leveling::LevelingConfig;
use crate::features::member_counter::MemberCounterConfig;
use crate::features::message_logging::MessageLoggingConfig;
use crate::features::raid_detection::RaidDetectionConfig;
use crate::features::reporting::ReportConfig;
use crate::features::tickets::TicketConfig;
use crate::shared::ok_or_none;
use anyhow::{Context, Result};
use fred::clients::Client;
use fred::interfaces::{FredResult, PubsubInterface};
use serde::{Deserialize, Serialize};
use serenity::all::GuildId;
use sqlx::PgPool;
use tracing::{debug, error, trace, warn};

/// Configuration settings for a Discord server (guild).
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct GuildSettings {
    /// Configuration for welcome messages sent when a new member joins.
    pub welcome: Option<Box<WelcomeConfig>>,

    /// Configuration for leave messages sent when a member exits.
    pub leave: Option<Box<LeaveConfig>>,

    /// Settings for logging message edits, deletions, and purges.
    pub message_logging: Option<Box<MessageLoggingConfig>>,

    /// Rules for automated message filtering (spam, links, word blacklists).
    pub message_filtering: Option<Box<MessageFilteringConfig>>,

    /// Configuration for user report commands and target report channels.
    pub report: Option<Box<ReportConfig>>,

    /// Settings for direct messaging users upon moderation actions (kicks/bans).
    pub moderation_dms: Option<Box<ModerationDMsConfig>>,

    /// Configuration for experience (XP) and leveling systems.
    pub leveling: Option<Box<LevelingConfig>>,

    /// Settings for ticket creation and support channel management.
    pub tickets: Option<Box<TicketConfig>>,

    /// Settings for tracking invite links and member invitation stats.
    pub invite_tracker: Option<Box<InviteTrackerConfig>>,

    /// Configuration for honeypot channels designed to trap self-bots.
    pub honeypot: Option<Box<HoneypotConfig>>,

    /// Settings for updating server member count channels or status topics.
    pub member_counter: Option<Box<MemberCounterConfig>>,

    /// Settings for member birthday tracking and announcement messages.
    pub birthday: Option<Box<BirthdayConfig>>,

    /// Configuration for automated anti-raid and mass-join protection.
    pub raid_detection: Option<Box<RaidDetectionConfig>>,
}

/// Direct message (DM) settings for various moderation actions.
#[derive(Serialize, Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ModerationDMsConfig {
    /// Message settings sent when a warning is issued to a user.
    #[serde(default, deserialize_with = "ok_or_none")]
    pub warn: Option<TogglableMessage>,

    /// Message settings sent when a user's warning is pardoned.
    #[serde(default, deserialize_with = "ok_or_none")]
    pub pardon_warn: Option<TogglableMessage>,

    /// Message settings sent when a warning pardon is revoked (unpardoned).
    #[serde(default, deserialize_with = "ok_or_none")]
    pub unpardon_warn: Option<TogglableMessage>,

    /// Message settings sent when a deleted warning is unpardoned or restored.
    #[serde(default, deserialize_with = "ok_or_none")]
    pub unpardon_delete_warn: Option<TogglableMessage>,

    /// Message settings sent when a user is muted or timed out.
    #[serde(default, deserialize_with = "ok_or_none")]
    pub mute: Option<TogglableMessage>,

    /// Message settings sent when a user's mute or timeout is removed.
    #[serde(default, deserialize_with = "ok_or_none")]
    pub unmute: Option<TogglableMessage>,

    /// Message settings sent when a user is kicked from the server.
    #[serde(default, deserialize_with = "ok_or_none")]
    pub kick: Option<TogglableMessage>,

    /// Message settings sent when a user is banned from the server.
    #[serde(default, deserialize_with = "ok_or_none")]
    pub ban: Option<TogglableMessage>,

    /// Message settings sent when a user is softbanned (kicked with message purge).
    #[serde(default, deserialize_with = "ok_or_none")]
    pub softban: Option<TogglableMessage>,

    /// Message settings sent when a user triggers an automated honeypot trap.
    #[serde(default, deserialize_with = "ok_or_none")]
    pub honeypot: Option<TogglableMessage>,
}

impl GuildSettings {
    /// A quick method to check if any message logging is enabled (delete or edit events)
    #[must_use]
    pub fn is_message_logging_enabled(&self) -> bool {
        self.message_logging
            .as_ref()
            .and_then(|l| l.events.as_ref())
            .is_some_and(|e| e.message_delete.unwrap_or(false) || e.message_edit.unwrap_or(false))
    }
}

fn parse_guild_settings(raw_json: &serde_json::Value, guild_id: GuildId) -> GuildSettings {
    match serde_path_to_error::deserialize(raw_json) {
        Ok(s) => {
            debug!(%guild_id, "Found config from DB.");
            s
        }
        Err(err) => {
            error!(
                error = %err.inner(),
                field_path = %err.path(),
                %guild_id,
                raw_json = %raw_json,
                "Failed to deserialize database JSON; falling back to default settings"
            );
            GuildSettings::default()
        }
    }
}

/// A simple wrapper to put `get_settings_inner` to the heap. Required as the future is massive.
///
/// # Errors
/// Returns `Err` if `get_settings_inner` fails at the DB, Redis, or Moka layer.
pub async fn get_settings(
    db: &PgPool,
    redis: &Client,
    cache: &moka::future::Cache<GuildId, GuildSettings>,
    guild_id: GuildId,
) -> Result<GuildSettings> {
    Box::pin(get_settings_inner(db, redis, cache, guild_id)).await
}

/// Retrieves settings. Returns a default struct if none exists in the DB.
///
/// # Errors
/// Returns `Err` if DB fails to give the guild config.
pub async fn get_settings_inner(
    db: &PgPool,
    redis: &Client,
    cache: &moka::future::Cache<GuildId, GuildSettings>,
    guild_id: GuildId,
) -> Result<GuildSettings> {
    // Get from Moka
    if let Some(settings) = cache.get(&guild_id).await {
        trace!(%guild_id, "Retrieved settings from memory cache");
        return Ok(settings);
    }

    // Get from Redis
    let cache_key = guild_config_key(guild_id);
    if let Some(settings) =
        Box::pin(redis::get_settings_from_redis(redis, &cache_key)).await
    {
        cache.insert(guild_id, settings.clone()).await;
        return Ok(settings);
    }

    debug!(%guild_id, key = %cache_key, "Settings cache miss; querying DB");

    // Get from DB
    let settings_db = database::get_settings_from_database(db, guild_id)
        .await
        .with_context(|| format!("Failed to query settings from DB for guild_id {guild_id}"))?;

    // Parses settings, return empty if not exist.
    let settings = settings_db.map_or_else(
        || {
            trace!(
                %guild_id,
                "No config found in database; using default settings"
            );
            GuildSettings::default()
        },
        |raw| parse_guild_settings(&raw, guild_id),
    );

    // Writes settings to Redis
    if let Err(e) = redis::set_setting_to_redis(redis, &settings, &cache_key).await {
        warn!(
            error = %e,
            %guild_id,
            key = %cache_key,
            "Failed to write settings to Redis cache"
        );
    }

    // Pushes settings to Moka
    cache.insert(guild_id, settings.clone()).await;

    Ok(settings)
}

/// Saves updated settings to Database, updates Redis cache, updates local Moka cache,
/// and publishes an invalidation event to the `config_updates` Pub/Sub channel.
///
/// # Errors
/// Returns `Err` if either the DB or Redis layer fails.
pub async fn save_settings(
    db: &PgPool,
    redis: &Client,
    cache: &moka::future::Cache<GuildId, GuildSettings>,
    guild_id: GuildId,
    settings: &GuildSettings,
) -> Result<()> {
    database::save_settings_to_db(db, guild_id, settings).await?;

    let cache_key = guild_config_key(guild_id);
    if let Err(e) = redis::set_setting_to_redis(redis, settings, &cache_key).await {
        warn!(
            error = %e,
            %guild_id,
            key = %cache_key,
            "Failed to write updated settings to Redis cache"
        );
    }

    cache.insert(guild_id, settings.clone()).await;
    let payload = keys::invalidate_settings_key(guild_id);
    let res: FredResult<i64> = redis.publish("config_updates", payload).await;
    if let Err(e) = res {
        warn!(
            error = %e,
            %guild_id,
            "Failed to publish config invalidation event to Redis Pub/Sub"
        );
    }

    Ok(())
}
