use crate::events::handlers::levels::cache;
use crate::types::config::leveling::LevelingConfig;
use crate::types::config::message_filter::ScopeMode;
use crate::types::leveling::XpMultiplier;
use crate::types::Error;
use fred::clients::Client;
use serenity::all::{ChannelId, GuildId, Message, RoleId};
use sqlx::PgPool;
use tracing::{debug, error, instrument, trace};

pub fn should_exclude_from_level_up(
    config: &LevelingConfig,
    user_roles: &[u64],
    channel_id: u64,
) -> bool {
    match config.scope.mode {
        ScopeMode::Exempt => {
            if config.scope.channels.contains(&channel_id) {
                return true;
            }
            if user_roles.iter().any(|role| config.scope.roles.contains(role)) {
                return true;
            }
            false
        }
        ScopeMode::Enforced => {
            if !config.scope.channels.is_empty() && !config.scope.channels.contains(&channel_id) {
                return true;
            }
            if !config.scope.roles.is_empty() {
                let has_allowed_role = user_roles.iter().any(|role| config.scope.roles.contains(role));
                if !has_allowed_role {
                    return true;
                }
            }
            false
        }
    }
}

fn calculate_multiplier(multipliers: Vec<XpMultiplier>, channel_id: u64, role_ids: Vec<u64>) -> f32 {
    let mut applied_multiplier = 1.0f32;
    let channel_id_str = channel_id.to_string();
    let role_ids_str: Vec<String> = role_ids.iter().map(|r| r.to_string()).collect();

    for mult in multipliers {
        match mult.target_type.as_str() {
            "channel" if mult.target_id == channel_id_str => {
                trace!(
                    target_id = %mult.target_id,
                    multiplier = mult.multiplier,
                    "Channel-specific XP multiplier applied"
                );
                applied_multiplier = applied_multiplier.max(mult.multiplier);
            }
            "role" if role_ids_str.contains(&mult.target_id) => {
                trace!(
                    target_id = %mult.target_id,
                    multiplier = mult.multiplier,
                    "Role-specific XP multiplier applied"
                );
                applied_multiplier = applied_multiplier.max(mult.multiplier);
            }
            _ => {}
        }
    }
    applied_multiplier
}

#[instrument(
    name = "get_multiplier",
    skip(redis, db, message),
    fields(
        guild_id = %guild_id.get(),
        channel_id = %message.channel_id.get(),
        author_id = %message.author.id.get()
    )
)]
pub async fn get_multiplier(
    redis: &Client,
    multiplier_key: &str,
    db: &PgPool,
    guild_id: &GuildId,
    message: &Message,
) -> Result<f32, Error> {
    trace!("Fetching multipliers");
    let multipliers = cache::cache_aside_multipliers(redis, multiplier_key, db, guild_id)
        .await
        .map_err(|err| {
            error!(error = %err, "Failed to retrieve XP multipliers from cache/database");
            err
        })?;

    let channel_id = message.channel_id.get();
    let roles = message.member.as_ref()
        .map(|m| m.roles.iter().map(|r| r.get()).collect())
        .unwrap_or_default();

    let multiplier = calculate_multiplier(multipliers, channel_id, roles);
    debug!(multiplier, "Successfully determined message multiplier");
    Ok(multiplier)
}

#[instrument(
    name = "get_voice_multiplier",
    skip(redis, db, member_roles),
    fields(
        guild_id = %guild_id.get(),
        channel_id = %channel_id.get()
    )
)]
pub async fn get_voice_multiplier(
    redis: &Client,
    multiplier_key: &str,
    db: &PgPool,
    guild_id: &GuildId,
    channel_id: ChannelId,
    member_roles: &[RoleId],
) -> Result<f32, Error> {
    trace!("Fetching voice multipliers");
    let multipliers = cache::cache_aside_multipliers(redis, multiplier_key, db, guild_id)
        .await
        .map_err(|err| {
            error!(error = %err, "Failed to retrieve voice XP multipliers from cache/database");
            err
        })?;

    let roles = member_roles.iter().map(|r| r.get()).collect();

    let multiplier = calculate_multiplier(multipliers, channel_id.get(), roles);
    debug!(multiplier, "Successfully determined voice multiplier");
    Ok(multiplier)
}