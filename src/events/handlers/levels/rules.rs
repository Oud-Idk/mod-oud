use crate::events::handlers::levels::levels_text::XpMultiplier;
use crate::events::handlers::levels::redis_cache;
use crate::types::config::leveling::LevelingConfig;
use crate::types::config::message_filter::ScopeMode;
use crate::types::Error;
use redis::aio::MultiplexedConnection;
use redis::AsyncCommands;
use serenity::all::{ChannelId, Context, GuildId, Message, RoleId, User};
use sqlx::PgPool;

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
        serde_json::from_str(&json_str).unwrap_or_default()
    } else {
        match guild_id_typed.member(&ctx.http, author.id).await {
            Ok(member) => {
                let fetched_roles: Vec<u64> = member.roles.iter().map(|role_id| role_id.get()).collect();

                if let Ok(json_str) = serde_json::to_string(&fetched_roles) {
                    let _: Result<(), _> = redis_conn.set_ex(&cache_key, json_str, 300).await;
                }
                fetched_roles
            }
            Err(_) => {
                let _: Result<(), _> = redis_conn.set_ex(&cache_key, "[]", 60).await;
                Vec::new()
            }
        }
    };

    match config.scope.mode {
        ScopeMode::Exempt => {
            if config.scope.channels.contains(&channel_u64) {
                return true;
            }
            if user_roles.iter().any(|role| config.scope.roles.contains(role)) {
                return true;
            }
            false
        }
        ScopeMode::Enforced => {
            if !config.scope.channels.is_empty() && !config.scope.channels.contains(&channel_u64) {
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
                applied_multiplier = applied_multiplier.max(mult.multiplier);
            }
            "role" if role_ids_str.contains(&mult.target_id) => {
                applied_multiplier = applied_multiplier.max(mult.multiplier);
            }
            _ => {}
        }
    }
    applied_multiplier
}

pub async fn get_multiplier(
    redis: &mut MultiplexedConnection,
    multiplier_key: &str,
    db: &PgPool,
    guild_id: &GuildId,
    message: &Message,
) -> Result<f32, Error> {
    let multipliers = redis_cache::cache_aside_multipliers(redis, multiplier_key, db, guild_id).await?;
    let channel_id = message.channel_id.get();
    let roles = message.member.as_ref()
        .map(|m| m.roles.iter().map(|r| r.get()).collect())
        .unwrap_or_default();

    Ok(calculate_multiplier(multipliers, channel_id, roles))
}

pub async fn get_voice_multiplier(
    redis: &mut MultiplexedConnection,
    multiplier_key: &str,
    db: &PgPool,
    guild_id: &GuildId,
    channel_id: ChannelId,
    member_roles: &[RoleId],
) -> Result<f32, Error> {
    let multipliers = redis_cache::cache_aside_multipliers(redis, multiplier_key, db, guild_id).await?;
    let roles = member_roles.iter().map(|r| r.get()).collect();

    Ok(calculate_multiplier(multipliers, channel_id.get(), roles))
}