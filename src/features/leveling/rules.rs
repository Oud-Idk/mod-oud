use crate::features::leveling::cache;
use crate::features::leveling::types::XpMultiplier;
use crate::features::leveling::types::{LevelingConfig, ScopeMode};
use anyhow::Result;
use fred::clients::Client;
use serenity::all::{ChannelId, GuildId, Message, RoleId};
use sqlx::PgPool;
use tracing::{debug, error, instrument, trace};

pub fn should_exclude_from_level_up(
    config: &LevelingConfig,
    user_roles: &[RoleId],
    channel_id: ChannelId,
) -> bool {
    match config.scope.mode {
        ScopeMode::Exempt => {
            if config.scope.channels.contains(&channel_id) {
                return true;
            }
            if user_roles
                .iter()
                .any(|role| config.scope.roles.contains(role))
            {
                return true;
            }
            false
        }
        ScopeMode::Enforced => {
            if !config.scope.channels.is_empty() && !config.scope.channels.contains(&channel_id) {
                return true;
            }
            if !config.scope.roles.is_empty() {
                let has_allowed_role = user_roles
                    .iter()
                    .any(|role| config.scope.roles.contains(role));
                if !has_allowed_role {
                    return true;
                }
            }
            false
        }
    }
}

fn calculate_multiplier(
    multipliers: Vec<XpMultiplier>,
    channel_id: ChannelId,
    role_ids: &[RoleId],
) -> f32 {
    let mut applied_multiplier = 1.0f32;
    let role_ids_i64: Vec<i64> = role_ids.iter().map(|r| (*r).get().cast_signed()).collect();

    for mult in multipliers {
        match mult.target_type.as_str() {
            "channel" if mult.target_id == channel_id.get().cast_signed() => {
                trace!(
                    target_id = %mult.target_id,
                    multiplier = mult.multiplier,
                    "Channel-specific XP multiplier applied"
                );
                applied_multiplier = applied_multiplier.max(mult.multiplier);
            }
            "role" if role_ids_i64.contains(&mult.target_id) => {
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
        %guild_id,
        channel_id = %message.channel_id.get(),
        author_id = %message.author.id.get()
    )
)]
pub async fn get_multiplier(
    redis: &Client,
    multiplier_key: &str,
    db: &PgPool,
    guild_id: GuildId,
    message: &Message,
) -> Result<f32> {
    trace!("Fetching multipliers");
    let multipliers = cache::cache_aside_multipliers(redis, multiplier_key, db, guild_id)
        .await
        .inspect_err(|err| {
            error!(error = %err, "Failed to retrieve XP multipliers from cache/database");
        })?;

    let channel_id = message.channel_id;
    let roles = message
        .member
        .as_ref()
        .map(|m| m.roles.as_slice())
        .unwrap_or_default();

    let multiplier = calculate_multiplier(multipliers, channel_id, roles);
    debug!(multiplier, "Successfully determined message multiplier");
    Ok(multiplier)
}

#[instrument(
    name = "get_voice_multiplier",
    skip(redis, db, member_roles),
    fields(
        %guild_id,
        channel_id = %channel_id.get()
    )
)]
pub async fn get_voice_multiplier(
    redis: &Client,
    multiplier_key: &str,
    db: &PgPool,
    guild_id: GuildId,
    channel_id: ChannelId,
    member_roles: &[RoleId],
) -> Result<f32> {
    trace!("Fetching voice multipliers");
    let multipliers = cache::cache_aside_multipliers(redis, multiplier_key, db, guild_id)
        .await
        .inspect_err(|err| {
            error!(error = %err, "Failed to retrieve voice XP multipliers from cache/database");
        })?;

    let multiplier = calculate_multiplier(multipliers, channel_id, member_roles);
    debug!(multiplier, "Successfully determined voice multiplier");
    Ok(multiplier)
}
