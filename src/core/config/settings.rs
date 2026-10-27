use crate::core::config::keys::guild_config_key;
use crate::core::config::message_layout::TogglableMessage;
use crate::core::config::{database, keys, redis};
use crate::features::automod::{HoneypotConfig, MessageFilteringConfig};
use crate::features::birthday::BirthdayConfig;
use crate::features::custom_commands::CustomCommandsConfig;
use crate::features::dynamic_slowmode::DynamicSlowmodeConfig;
use crate::features::economy::EconomyConfig;
use crate::features::gambling::GamblingConfig;
use crate::features::invite_tracking::InviteTrackerConfig;
use crate::features::join_leave::{LeaveConfig, WelcomeConfig};
use crate::features::leveling::LevelingConfig;
use crate::features::member_counter::MemberCounterConfig;
use crate::features::message_logging::MessageLoggingConfig;
use crate::features::raid_detection::RaidDetectionConfig;
use crate::features::reporting::ReportConfig;
use crate::features::tickets::TicketConfig;
use crate::features::verification::VerificationSettings;
use crate::shared::ok_or_none;
use anyhow::{Context, Result};
use fred::clients::Client;
use serde::{Deserialize, Serialize};
use serenity::all::GuildId;
use sqlx::PgPool;
use tracing::{debug, warn};

/// Configuration settings for a Discord server (guild).
#[derive(Serialize, Deserialize, Debug, Clone, Default)]
#[serde(default)]
pub struct GuildSettings {
    /// Configuration for welcome messages sent when a new member joins.
    pub welcome: Option<Box<WelcomeConfig>>,

    /// Configuration for membership verification (captcha, verified role).
    pub verification: Option<Box<VerificationSettings>>,

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

    /// Configuration for the virtual economy system (cash, bank, work).
    pub economy: Option<Box<EconomyConfig>>,

    /// Configuration for gambling games (bet limits, cooldowns, per-game toggles).
    pub gambling: Option<Box<GamblingConfig>>,

    /// Configuration for custom commands (trigger prefix).
    pub custom_commands: Option<Box<CustomCommandsConfig>>,

    /// Policy for raising and lowering channel slowmode in response to traffic.
    pub dynamic_slowmode: Option<Box<DynamicSlowmodeConfig>>,
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
    /// Returns the membership verification settings, preferring the top-level
    /// `verification` key and falling back to the legacy `welcome.verification`
    /// nesting for rows written before the split migration.
    #[must_use]
    pub fn verification_settings(&self) -> Option<&VerificationSettings> {
        self.verification.as_deref()
    }

    /// A quick method to check if any message logging is enabled (delete or edit events)
    #[must_use]
    pub fn is_message_logging_enabled(&self) -> bool {
        self.message_logging
            .as_ref()
            .and_then(|l| l.events.as_ref())
            .is_some_and(|e| e.message_delete.unwrap_or(false) || e.message_edit.unwrap_or(false))
    }
}

/// Decodes each feature's settings on its own, so one unreadable field cannot discard the rest.
///
/// A whole-document decode used to fail as a unit and fall back to `GuildSettings::default()`,
/// which silently turned off every other feature's moderation for the guild.
fn parse_guild_settings(raw_json: &serde_json::Value, guild_id: GuildId) -> GuildSettings {
    match serde_path_to_error::deserialize(raw_json) {
        Ok(s) => {
            debug!(%guild_id, "found config from DB");
            s
        }
        Err(err) => {
            warn!(
                error = %err.inner(),
                field_path = %err.path(),
                %guild_id,
                fallback = "per-feature recovery",
                "settings deserialize from the database row failed; keeping the readable features"
            );
            recover_guild_settings(raw_json, guild_id)
        }
    }
}

/// Keeps every feature whose settings still decode, and defaults only the ones that do not.
fn recover_guild_settings(raw_json: &serde_json::Value, guild_id: GuildId) -> GuildSettings {
    let Some(object) = raw_json.as_object() else {
        warn!(%guild_id, "guild settings row is not an object; using defaults");
        return GuildSettings::default();
    };

    let mut settings = GuildSettings::default();
    let mut kept = 0_usize;

    for (key, value) in object {
        // Decode this one field on its own, so a neighbour's bad value is irrelevant.
        let single = serde_json::json!({ key: value });
        match serde_path_to_error::deserialize::<_, GuildSettings>(&single) {
            Ok(decoded) => {
                merge_feature(&mut settings, decoded);
                kept += 1;
            }
            Err(err) => {
                warn!(
                    error = %err.inner(),
                    field_path = %err.path(),
                    %guild_id,
                    field = key.as_str(),
                    "one feature's settings could not be read; defaulting only that feature"
                );
            }
        }
    }

    debug!(%guild_id, kept, "guild settings recovered per feature");
    settings
}

/// Copies the single feature a one-field decode produced into `into`.
fn merge_feature(into: &mut GuildSettings, decoded: GuildSettings) {
    macro_rules! take {
        ($($field:ident),* $(,)?) => {
            $(
                if decoded.$field.is_some() {
                    into.$field = decoded.$field;
                }
            )*
        };
    }

    take!(
        welcome,
        verification,
        leave,
        message_logging,
        message_filtering,
        report,
        moderation_dms,
        leveling,
        tickets,
        invite_tracker,
        honeypot,
        member_counter,
        birthday,
        raid_detection,
        economy,
        gambling,
        custom_commands,
        dynamic_slowmode,
    );
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
        debug!(%guild_id, "retrieved settings from memory cache");
        return Ok(settings);
    }

    // Get from Redis
    let cache_key = guild_config_key(guild_id);
    if let Some(settings) = Box::pin(redis::get_settings_from_redis(redis, &cache_key)).await {
        cache.insert(guild_id, settings.clone()).await;
        return Ok(settings);
    }

    debug!(%guild_id, key = %cache_key, fallback = "db", "settings cache miss");

    // Get from DB
    let settings_db = database::get_settings_from_database(db, guild_id)
        .await
        .with_context(|| format!("Failed to query settings from DB for guild_id {guild_id}"))?;

    // Parses settings, return empty if not exist.
    let settings = settings_db.map_or_else(
        || {
            debug!(%guild_id, fallback = "defaults", "no config found in database");
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
            "settings cache write to redis failed"
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
            "settings cache update to redis failed"
        );
    }

    cache.insert(guild_id, settings.clone()).await;
    let payload = keys::invalidate_settings_key(guild_id);
    if let Err(e) = redis::publish_config_invalidation(redis, &payload).await {
        warn!(
            error = %e,
            %guild_id,
            "config invalidation publish to redis failed"
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{GuildSettings, parse_guild_settings};
    use serde_json::json;
    use serenity::all::GuildId;

    fn guild() -> GuildId {
        GuildId::new(123456789012345678)
    }

    #[test]
    fn a_good_document_decodes_directly() {
        let raw = json!({ "invite_tracker": { "enabled": true } });

        assert!(parse_guild_settings(&raw, guild()).invite_tracker.is_some());
    }

    #[test]
    fn one_bad_field_does_not_discard_the_others() {
        // `invite_tracker` is readable; `message_filtering` is not. Losing the readable one
        // would silently disable a feature the operator had configured.
        let raw = json!({
            "invite_tracker": { "enabled": true },
            "message_filtering": "not-an-object"
        });

        let parsed = parse_guild_settings(&raw, guild());

        assert!(
            parsed.invite_tracker.is_some(),
            "a readable feature must survive another feature's bad field"
        );
        assert!(
            parsed.message_filtering.is_none(),
            "the unreadable feature falls back to unset"
        );
    }

    #[test]
    fn an_unreadable_document_still_yields_settings() {
        let raw = json!({ "message_filtering": 42, "welcome": 7 });

        // Must not panic, and must return something usable.
        let parsed: GuildSettings = parse_guild_settings(&raw, guild());

        assert!(parsed.message_filtering.is_none());
        assert!(parsed.welcome.is_none());
    }

    #[test]
    fn a_non_object_row_uses_defaults() {
        let parsed = parse_guild_settings(&json!("nonsense"), guild());

        assert!(parsed.invite_tracker.is_none());
    }
}
