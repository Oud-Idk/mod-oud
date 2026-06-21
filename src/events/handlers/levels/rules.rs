use crate::events::handlers::levels::levels_text::XpMultiplier;
use crate::events::handlers::levels::redis_cache;
use crate::types::config::leveling::LevelingConfig;
use crate::types::config::message_filter::ScopeMode;
use crate::types::Error;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serenity::all::{ChannelId, Context, GuildId, Message, RoleId, User};
use sqlx::PgPool;
use tracing::{debug, error, instrument, trace, warn};

#[instrument(
    name = "should_exclude_from_level_up",
    skip(config, redis_conn, ctx),
    fields(
        author_id = %author.id.get(),
        guild_id = %guild_id,
        channel_id = %channel_id
    )
)]
pub async fn should_exclude_from_level_up(
    config: &LevelingConfig,
    author: &User,
    redis_conn: &mut MultiplexedConnection,
    channel_id: &i64,
    guild_id: &u64,
    ctx: &Context,
) -> bool {
    let channel_u64 = *channel_id as u64;
    let guild_id_typed = GuildId::new(*guild_id);
    let cache_key = format!("xp_roles:{}:{}", guild_id, author.id.get());

    let cached_data: Option<String> = redis_conn.get(&cache_key).await.ok();

    let user_roles: Vec<u64> = if let Some(json_str) = cached_data {
        trace!("Cache hit for user roles");
        serde_json::from_str(&json_str).unwrap_or_else(|err| {
            warn!(error = %err, "Failed to deserialize cached user roles");
            Vec::new()
        })
    } else {
        trace!("Cache miss for user roles; fetching from Discord HTTP API");
        match guild_id_typed.member(&ctx.http, author.id).await {
            Ok(member) => {
                let fetched_roles: Vec<u64> = member.roles.iter().map(|role_id| role_id.get()).collect();

                if let Ok(json_str) = serde_json::to_string(&fetched_roles) {
                    let res: Result<(), _> = redis_conn.set_ex(&cache_key, json_str, 300).await;
                    if let Err(err) = res {
                        warn!(error = %err, "Failed to cache user roles in Redis");
                    }
                }
                fetched_roles
            }
            Err(err) => {
                warn!(error = %err, "Failed to fetch member roles from Discord API");
                let res: Result<(), _> = redis_conn.set_ex(&cache_key, "[]", 60).await;
                if let Err(err) = res {
                    warn!(error = %err, "Failed to write fallback empty user roles cache in Redis");
                }
                Vec::new()
            }
        }
    };

    let result = match config.scope.mode {
        ScopeMode::Exempt => {
            if config.scope.channels.contains(&channel_u64) {
                debug!(channel_id = channel_u64, "Excluding level up: channel is in the exempt list");
                return true;
            }
            if user_roles.iter().any(|role| config.scope.roles.contains(role)) {
                debug!("Excluding level up: user possesses an exempt role");
                return true;
            }
            false
        }
        ScopeMode::Enforced => {
            if !config.scope.channels.is_empty() && !config.scope.channels.contains(&channel_u64) {
                debug!(channel_id = channel_u64, "Excluding level up: channel is not in the enforced list");
                return true;
            }
            if !config.scope.roles.is_empty() {
                let has_allowed_role = user_roles.iter().any(|role| config.scope.roles.contains(role));
                if !has_allowed_role {
                    debug!("Excluding level up: user lacks required enforced role");
                    return true;
                }
            }
            false
        }
    };

    trace!(excluded = result, "Completed leveling exclusion check");
    result
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
    redis: &mut MultiplexedConnection,
    multiplier_key: &str,
    db: &PgPool,
    guild_id: &GuildId,
    message: &Message,
) -> Result<f32, Error> {
    trace!("Fetching multipliers");
    let multipliers = redis_cache::cache_aside_multipliers(redis, multiplier_key, db, guild_id)
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
    redis: &mut MultiplexedConnection,
    multiplier_key: &str,
    db: &PgPool,
    guild_id: &GuildId,
    channel_id: ChannelId,
    member_roles: &[RoleId],
) -> Result<f32, Error> {
    trace!("Fetching voice multipliers");
    let multipliers = redis_cache::cache_aside_multipliers(redis, multiplier_key, db, guild_id)
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